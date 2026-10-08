import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { logger, serializeError, serializeMetaError } from '@/lib/logger';
import crypto from 'crypto';

import { GRAPH_API_BASE } from '@/lib/meta/constants';
import { CAROUSEL_MIN_CARDS, CAROUSEL_MAX_CARDS } from '@/types/ad-types';
import {
    buildMediaSourcingSpec,
    mediaKey,
    mediaLabel,
    normalizeMediaItems,
} from '@/lib/meta/multiMedia';

// Advantage+ creative enhancement toggles supported by degrees_of_freedom_spec
const ENHANCEMENT_KEYS = [
    'enhance_cta',
    'adapt_to_placement',
    'product_extensions',
    'video_auto_crop',
    'show_summary',
    'inline_comment',
    'image_brightness_and_contrast',
    'reveal_details_over_time',
    'site_extensions',
    'text_optimizations',
    'image_animation',
    'add_text_overlay',
    'image_templates',
    'image_touchups',
] as const;

function buildCreativeFeatures(
    enhancements: Record<string, boolean>,
    hasVideo: boolean
): Record<string, { enroll_status: string }> {
    const features: Record<string, { enroll_status: string }> = {};
    for (const key of ENHANCEMENT_KEYS) {
        if (!enhancements[key]) continue;
        if (key === 'video_auto_crop' && !hasVideo) continue;
        features[key] = { enroll_status: 'OPT_IN' };
    }
    return features;
}

// Ordered carousel card sent by the wizard — preserves the row's asset order
// so cards pair with headlines by position
interface CarouselCard {
    type: 'image' | 'video';
    hash?: string;
    videoId?: string;
}

// Video-readiness polling can legitimately wait ~60s before the two Meta
// creation calls even start — give the function room beyond the plan default.
// (Vercel: values above 60s require a Pro plan; lower if deploying on Hobby.)
export const maxDuration = 300;

const MAX_VIDEO_POLL_ATTEMPTS = 20;
const VIDEO_POLL_INTERVAL_MS = 3000; // 3 seconds between polls

/**
 * Poll a video until Meta finishes processing it. Videos must be 'ready'
 * before they can be referenced by an ad creative. Returns the video's
 * thumbnail when available (required for carousel video cards).
 */
async function waitForVideoReady(
    accessToken: string,
    videoId: string,
    sid: string
): Promise<{ status: 'ready' | 'error' | 'timeout'; thumbnailUrl: string | null }> {
    for (let attempt = 1; attempt <= MAX_VIDEO_POLL_ATTEMPTS; attempt++) {
        const statusRes = await fetch(
            `${GRAPH_API_BASE}/${videoId}?fields=status,picture`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const statusData = await statusRes.json();
        const videoStatus = statusData.status?.video_status;

        logger.debug('publish', `Video status poll ${attempt}/${MAX_VIDEO_POLL_ATTEMPTS}`, { sid, videoId, videoStatus });

        if (videoStatus === 'ready') {
            // Prefer the full-size preferred thumbnail: the video's `picture`
            // field is a 160×160 preview (seen in the Oct 2026 probe) and would
            // become the ad's lead-image when a video is the primary media
            let thumbnailUrl: string | null = null;
            try {
                const thumbRes = await fetch(
                    `${GRAPH_API_BASE}/${videoId}/thumbnails?fields=id,is_preferred,uri`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                const thumbData = await thumbRes.json();
                if (thumbData.data && thumbData.data.length > 0) {
                    const thumbs = thumbData.data as Array<{ is_preferred?: boolean; uri: string }>;
                    thumbnailUrl = (thumbs.find((t) => t.is_preferred) || thumbs[0]).uri;
                }
            } catch (e) {
                logger.warn('publish', 'Thumbnail lookup failed (falling back to picture)', { sid, videoId, error: serializeError(e) });
            }
            return { status: 'ready', thumbnailUrl: thumbnailUrl || statusData.picture || null };
        }

        if (videoStatus === 'error') {
            logger.error('publish', 'Video processing failed on Meta servers', { sid, videoId, status: statusData.status });
            return { status: 'error', thumbnailUrl: null };
        }

        if (attempt < MAX_VIDEO_POLL_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));
        }
    }
    return { status: 'timeout', thumbnailUrl: null };
}

/**
 * Publish an ad to an existing campaign/ad set
 * 
 * This endpoint handles the full ad creation flow:
 * 1. Upload assets (images/videos) if not already uploaded
 * 2. Create an ad creative (supports Dynamic Creative with multiple assets)
 * 3. Create the ad under the specified ad set
 * 
 * POST body: {
 *   accessToken: string,
 *   adAccountId: string,       // Format: act_XXXXXXXXX
 *   adSetId: string,           // Target ad set ID
 *   pageId: string,            // Facebook Page ID for the ad
 *   adName: string,            // Name for the ad
 *   destinationUrl: string,    // Link URL
 *   callToAction: string,      // CTA type (LEARN_MORE, SHOP_NOW, etc.)
 *   primaryTexts: string[],    // Up to 5 primary texts (carousel uses only [0])
 *   headlines: string[],       // Up to 5 headlines; carousel: positional per card, up to 10
 *   imageHashes?: string[],    // Pre-uploaded image hashes
 *   videoIds?: string[],       // Pre-uploaded video IDs
 *   urlParameters?: string,    // UTM tracking params
 *   status: 'PAUSED' | 'ACTIVE',
 * }
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const {
            adAccountId,
            adSetId,
            pageId,
            adName,
            destinationUrl,
            callToAction = 'LEARN_MORE',
            primaryTexts = [],
            headlines = [],
            imageHashes = [],
            videoIds = [],
            urlParameters = '',
            status = 'PAUSED',
            adType = 'flexible', // 'flexible' | 'single_image' | 'single_video' | 'carousel' | 'multi_media'
            cards = [], // Ordered carousel cards: [{ type, hash?, videoId? }] — pairs with headlines by index
            media = [], // Ordered multi-media items: [{ type, name?, hash?, videoId?, width?, height?, stack? }] — [0] is primary
            pixelId = '', // Pixel ID for conversion tracking
            enhancements = {}, // Creative enhancement toggles
            instagramActorId = '', // Instagram Business Account ID
        } = body;

        // Validate required fields
        if (!adAccountId || !adSetId || !pageId) {
            return NextResponse.json(
                { error: 'adAccountId, adSetId, and pageId are required' },
                { status: 400 }
            );
        }

        if (!adName || !destinationUrl) {
            return NextResponse.json(
                { error: 'adName and destinationUrl are required' },
                { status: 400 }
            );
        }

        if (primaryTexts.length === 0 || headlines.length === 0) {
            return NextResponse.json(
                { error: 'At least one primary text and one headline are required' },
                { status: 400 }
            );
        }

        if (adType === 'carousel') {
            if (!Array.isArray(cards) || cards.length < CAROUSEL_MIN_CARDS) {
                return NextResponse.json(
                    { error: `Carousel ads require at least ${CAROUSEL_MIN_CARDS} cards, in order` },
                    { status: 400 }
                );
            }
        } else if (adType === 'multi_media') {
            if (!Array.isArray(media) || media.length === 0) {
                return NextResponse.json(
                    { error: 'Multi-media ads require at least one media item, in order' },
                    { status: 400 }
                );
            }
        } else if (imageHashes.length === 0 && videoIds.length === 0) {
            return NextResponse.json(
                { error: 'At least one image hash or video ID is required' },
                { status: 400 }
            );
        }

        // Generate a unique session ID to correlate all logs from this publish attempt
        const sid = crypto.randomBytes(4).toString('hex');

        logger.info('publish', 'Ad publish request', {
            sid, adAccountId, adSetId, pageId, adName, destinationUrl, callToAction,
            primaryTextsCount: primaryTexts.length, headlinesCount: headlines.length,
            imageHashesCount: imageHashes.length,
            videoIdsCount: videoIds.length, urlParameters, status,
        });

        // Check ad set's is_dynamic_creative status for diagnostics
        try {
            const adSetCheckRes = await fetch(
                `${GRAPH_API_BASE}/${adSetId}?fields=id,name,is_dynamic_creative,campaign{id,name,objective}`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const adSetData = await adSetCheckRes.json();
            logger.debug('publish', 'Target ad set info', { sid, adSetData });
        } catch (e) {
            logger.warn('publish', 'Could not fetch ad set info', { sid, error: serializeError(e) });
        }

        // UTM parameters are NOT appended to destinationUrl — each creative
        // carries them in `url_tags` (see docs/FLEXIBLE_AD_IMPLEMENTATION.md).
        logger.debug('publish', 'Ad info', { sid, adType, urlParameters });

        // Verify ALL referenced videos have finished processing before creating
        // the ad — a still-processing video can fail the whole creative, and
        // flexible ads routinely carry several. Polls run in parallel, so the
        // wait is one polling window regardless of video count. The lead
        // video's thumbnail is captured for video_data creatives.
        // (Carousel and multi-media handle their own per-item video readiness below.)
        let videoThumbnailUrl: string | null = null;
        const firstVideoId = videoIds[0];
        const firstImageHash = imageHashes[0];

        if (adType !== 'carousel' && adType !== 'multi_media' && videoIds.length > 0) {
            try {
                logger.info('publish', 'Polling video processing status', { sid, videoCount: videoIds.length });
                const results = await Promise.all(
                    (videoIds as string[]).map(id => waitForVideoReady(accessToken, id, sid))
                );

                const errorIndex = results.findIndex(r => r.status === 'error');
                if (errorIndex >= 0) {
                    return NextResponse.json(
                        { error: `Video ${errorIndex + 1} of ${videoIds.length} failed processing on Meta. Please re-upload it.` },
                        { status: 422 }
                    );
                }
                const timeoutIndex = results.findIndex(r => r.status === 'timeout');
                if (timeoutIndex >= 0) {
                    logger.error('publish', 'Video still processing after max attempts', { sid, videoId: videoIds[timeoutIndex], attempts: MAX_VIDEO_POLL_ATTEMPTS });
                    return NextResponse.json(
                        { error: `Video ${timeoutIndex + 1} of ${videoIds.length} is still processing after ${MAX_VIDEO_POLL_ATTEMPTS * VIDEO_POLL_INTERVAL_MS / 1000}s. Please try again in a minute.` },
                        { status: 422 }
                    );
                }

                if (firstVideoId && !firstImageHash) {
                    videoThumbnailUrl = results[0].thumbnailUrl;
                }
                logger.info('publish', 'All videos ready for ad use', { sid, videoCount: videoIds.length, thumbnailUrl: videoThumbnailUrl });
            } catch (e) {
                logger.warn('publish', 'Video status polling error (proceeding anyway)', { sid, error: serializeError(e) });
            }
        }

        // === ROUTE BY AD TYPE ===
        // multi_media → inline creative with media_sourcing_spec (direct ad creation)
        // carousel → object_story_spec.link_data.child_attachments (two-step)
        // single_image / single_video → asset_feed_spec + AdCreative (two-step)
        // flexible → creative_asset_groups_spec (direct ad creation, unchanged)

        const isSingleAd = adType === 'single_image' || adType === 'single_video';

        if (adType === 'multi_media') {
            // === MULTI-MEDIA: creative.media_sourcing_spec (docs/MULTI_MEDIA_ADS.md) ===
            // One ad, up to 10 images + videos. Item 0 is the primary media in
            // object_story_spec and is ALSO listed in the spec (Meta requires
            // both). Images sharing a `stack` become one group of orientation
            // variants (Meta serves the variant that fits each placement).
            const { items, droppedDuplicates, droppedInvalid } = normalizeMediaItems(media);
            if (items.length === 0) {
                return NextResponse.json(
                    { error: 'Multi-media ad has no usable media (every item was missing its image hash or video id).', sid },
                    { status: 422 }
                );
            }
            if (droppedInvalid > 0) {
                logger.warn('publish', 'Dropped malformed multi-media items', { sid, droppedInvalid });
            }

            // Every video must finish processing, and each spec entry needs
            // a thumbnail_url. Parallel polls → one polling window total.
            const videoChecks = await Promise.all(
                items.map(item =>
                    item.type === 'video' && item.videoId
                        ? waitForVideoReady(accessToken, item.videoId, sid)
                        : Promise.resolve(null)
                )
            );
            const failedIndex = videoChecks.findIndex(r => r && r.status !== 'ready');
            if (failedIndex >= 0) {
                const failed = videoChecks[failedIndex]!;
                const label = mediaLabel(items[failedIndex], failedIndex);
                return NextResponse.json(
                    {
                        error: failed.status === 'error'
                            ? `Video ${label} failed processing on Meta. Please re-upload it.`
                            : `Video ${label} is still processing after ${MAX_VIDEO_POLL_ATTEMPTS * VIDEO_POLL_INTERVAL_MS / 1000}s. Please try again in a minute.`,
                        sid,
                    },
                    { status: 422 }
                );
            }
            const missingThumbIndex = videoChecks.findIndex(r => r && !r.thumbnailUrl);
            if (missingThumbIndex >= 0) {
                return NextResponse.json(
                    { error: `Video ${mediaLabel(items[missingThumbIndex], missingThumbIndex)} has no thumbnail on Meta yet — multi-media ads need one per video. Try again in a minute.`, sid },
                    { status: 422 }
                );
            }
            const withThumbs = items.map((item, i) => ({
                ...item,
                thumbnailUrl: videoChecks[i]?.thumbnailUrl ?? null,
            }));

            const built = buildMediaSourcingSpec({
                items: withThumbs,
                primaryTexts: primaryTexts as string[],
                headlines: headlines as string[],
            });
            const primary = built.items[0];

            const callToActionSpec = {
                type: callToAction,
                value: { link: destinationUrl },
            };
            const objectStorySpec: Record<string, unknown> = {
                page_id: pageId,
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };
            if (primary.type === 'video') {
                objectStorySpec.video_data = {
                    video_id: primary.videoId,
                    image_url: primary.thumbnailUrl,
                    call_to_action: callToActionSpec,
                };
            } else {
                objectStorySpec.link_data = {
                    link: destinationUrl,
                    image_hash: primary.hash,
                    call_to_action: callToActionSpec,
                };
            }

            const creativeObject: Record<string, unknown> = {
                name: `${adName} - Creative`,
                object_story_spec: objectStorySpec,
                media_sourcing_spec: built.spec,
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };

            const creativeFeatures = buildCreativeFeatures(
                enhancements,
                built.items.some(item => item.type === 'video')
            );
            if (Object.keys(creativeFeatures).length > 0) {
                creativeObject.degrees_of_freedom_spec = {
                    creative_features_spec: creativeFeatures,
                };
            }
            if (urlParameters) {
                creativeObject.url_tags = urlParameters;
            }

            const adPayload: Record<string, string> = {
                name: adName,
                adset_id: adSetId,
                status: status,
                creative: JSON.stringify(creativeObject),
                ...(pixelId ? { tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [pixelId] }]) } : {}),
            };

            logger.info('publish', 'Creating ad via media_sourcing_spec (multi-media)', {
                sid,
                mediaCount: built.items.length,
                imageCount: built.items.filter(i => i.type === 'image').length,
                videoCount: built.items.filter(i => i.type === 'video').length,
                droppedDuplicates,
                groupCount: built.groupCount,
                primaryType: primary.type,
                instagramActorId: instagramActorId || '(none)',
            });

            const adResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/ads`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: new URLSearchParams(adPayload),
                }
            );
            const adData = await adResponse.json();

            if (!adResponse.ok || adData.error) {
                logger.error('publish', 'Ad creation error (multi-media path)', { sid, metaError: serializeMetaError(adData), payload: adPayload });
                return NextResponse.json(
                    {
                        error: adData.error?.message || 'Failed to create multi-media ad',
                        errorType: adData.error?.type,
                        errorCode: adData.error?.code,
                        details: adData.error,
                        fullResponse: adData,
                    },
                    { status: adResponse.status || 500 }
                );
            }

            // Read back what Meta actually stored and compare item-by-item.
            // Earlier mixed-media write shapes were accepted and then silently
            // dropped assets. Only `source: multi_media` entries are ours —
            // Meta adds its own related_media / gen_ai items. Never fails the
            // publish (the ad exists either way); problems become a warning.
            let mediaPersisted: number | null = null;
            const warnings: string[] = [];
            if (droppedDuplicates > 0) {
                warnings.push(`${droppedDuplicates} file(s) were identical to another in this ad and were sent once.`);
            }
            try {
                const readRes = await fetch(
                    `${GRAPH_API_BASE}/${adData.id}?fields=${encodeURIComponent('creative{id,media_sourcing_spec}')}`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                const readData = await readRes.json();
                const stored = readData.creative?.media_sourcing_spec;
                if (stored) {
                    type StoredMedia = { source?: string; hash?: string; video_id?: string; original_video_id?: string; group_id?: string };
                    const ours = [
                        ...((stored.images ?? []) as StoredMedia[]).filter(m => m.source === 'multi_media')
                            .map(m => ({ key: mediaKey({ type: 'image', hash: m.hash }), group: m.group_id })),
                        ...((stored.videos ?? []) as StoredMedia[]).filter(m => m.source === 'multi_media')
                            .map(m => ({ key: mediaKey({ type: 'video', videoId: m.original_video_id ?? m.video_id }), group: undefined })),
                    ];
                    const persistedKeys = new Set(ours.map(m => m.key));
                    mediaPersisted = built.items.filter(item => persistedKeys.has(mediaKey(item))).length;
                    const missing = built.items
                        .map((item, i) => ({ item, i }))
                        .filter(({ item }) => !persistedKeys.has(mediaKey(item)))
                        .map(({ item, i }) => mediaLabel(item, i));
                    if (missing.length > 0) {
                        warnings.push(`Meta didn't keep ${missing.join(', ')} — check this ad in Ads Manager.`);
                    }
                    const groupsPersisted = new Set(ours.map(m => m.group).filter(Boolean)).size;
                    if (groupsPersisted < built.groupCount) {
                        warnings.push(`Meta kept ${groupsPersisted} of ${built.groupCount} image stacks — shapes may not be matched to placements.`);
                    }
                    logger[warnings.length > 0 ? 'warn' : 'info']('publish', 'Multi-media read-back', {
                        sid, adId: adData.id, creativeId: readData.creative?.id,
                        mediaSent: built.items.length, mediaPersisted, missing,
                        groupsSent: built.groupCount, groupsPersisted,
                        metaAddedItems: ((stored.images?.length ?? 0) + (stored.videos?.length ?? 0)) - ours.length,
                    });
                } else {
                    logger.warn('publish', 'Multi-media read-back returned no media_sourcing_spec', { sid, adId: adData.id, readData });
                }
            } catch (e) {
                logger.warn('publish', 'Multi-media read-back failed (ad was created)', { sid, adId: adData.id, error: serializeError(e) });
            }

            logger.info('publish', 'Ad created (multi-media path)', { sid, adId: adData.id, adName });

            return NextResponse.json({
                success: true,
                adId: adData.id,
                adName,
                mediaSent: built.items.length,
                mediaPersisted,
                ...(warnings.length > 0 && { warning: warnings.join(' ') }),
            });

        } else if (adType === 'carousel') {
            // === CAROUSEL: child_attachments, paired by position ===
            // Card i = asset i + headline i. The wizard sends headlines
            // positionally ('' for a deliberately blank slot — that card's name
            // is omitted, never borrowed from another card); only an out-of-range
            // index falls back to the last headline. Primary Text 1 is the
            // single ad-level message shown above all cards.
            const carouselCards = (cards as CarouselCard[]).slice(0, CAROUSEL_MAX_CARDS);

            // All video cards must finish processing, and each needs a
            // thumbnail (Meta requires a picture on video child attachments).
            // Polls run in parallel so a many-video deck waits one polling
            // window (max ~60s), not one per video — serial polling of up to
            // 10 videos could exceed the serverless execution ceiling.
            const videoChecks = await Promise.all(
                carouselCards.map(card =>
                    card.type === 'video' && card.videoId
                        ? waitForVideoReady(accessToken, card.videoId, sid)
                        : Promise.resolve(null)
                )
            );
            if (videoChecks.some(r => r?.status === 'error')) {
                return NextResponse.json(
                    { error: 'A carousel video failed processing on Meta. Please re-upload it.' },
                    { status: 422 }
                );
            }
            if (videoChecks.some(r => r?.status === 'timeout')) {
                return NextResponse.json(
                    { error: `A carousel video is still processing after ${MAX_VIDEO_POLL_ATTEMPTS * VIDEO_POLL_INTERVAL_MS / 1000}s. Please try again in a minute.` },
                    { status: 422 }
                );
            }
            const cardThumbnails = videoChecks.map(r => r?.thumbnailUrl ?? null);

            const childAttachments = carouselCards.map((card, i) => ({
                link: destinationUrl,
                ...((headlines[i] ?? headlines[headlines.length - 1]) && { name: headlines[i] ?? headlines[headlines.length - 1] }),
                ...(card.type === 'video' && card.videoId
                    // child_attachments takes `picture` (a URL) or `image_hash`,
                    // NOT `image_url` (that's a video_data field) — using image_url
                    // here silently drops the thumbnail / gets the card rejected.
                    ? { video_id: card.videoId, ...(cardThumbnails[i] && { picture: cardThumbnails[i] }) }
                    : { image_hash: card.hash }),
                call_to_action: {
                    type: callToAction,
                    value: { link: destinationUrl },
                },
            }));

            const objectStorySpec: Record<string, unknown> = {
                page_id: pageId,
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
                link_data: {
                    link: destinationUrl,
                    message: primaryTexts[0] || '',
                    child_attachments: childAttachments,
                    // Don't append Meta's auto-generated end card — the deck
                    // is exactly the cards the strategist built
                    multi_share_end_card: false,
                },
            };

            const creativePayload: Record<string, string> = {
                name: `${adName} - Creative`,
                object_story_spec: JSON.stringify(objectStorySpec),
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };

            const creativeFeatures = buildCreativeFeatures(
                enhancements,
                carouselCards.some(c => c.type === 'video')
            );
            if (Object.keys(creativeFeatures).length > 0) {
                creativePayload.degrees_of_freedom_spec = JSON.stringify({
                    creative_features_spec: creativeFeatures,
                });
            }

            if (urlParameters) {
                creativePayload.url_tags = urlParameters;
            }

            logger.info('publish', 'Creating AdCreative via child_attachments (carousel)', {
                sid,
                cardCount: carouselCards.length,
                videoCards: carouselCards.filter(c => c.type === 'video').length,
                headlinesCount: headlines.length,
                instagramActorId: instagramActorId || '(none)',
            });

            // Step 1: Create AdCreative
            const creativeResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/adcreatives`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        access_token: accessToken,
                        ...creativePayload,
                    }),
                }
            );

            const creativeData = await creativeResponse.json();

            if (!creativeResponse.ok || creativeData.error) {
                logger.error('publish', 'Carousel AdCreative creation failed', { sid, metaError: serializeMetaError(creativeData), payload: creativePayload });
                return NextResponse.json(
                    {
                        error: creativeData.error?.message || 'Failed to create carousel ad creative',
                        errorType: creativeData.error?.type,
                        errorCode: creativeData.error?.code,
                        details: creativeData.error,
                        fullResponse: creativeData,
                    },
                    { status: creativeResponse.status || 500 }
                );
            }

            const creativeId = creativeData.id;
            logger.info('publish', 'Carousel AdCreative created', { sid, creativeId });

            // Step 2: Create Ad referencing the creative
            const adPayload: Record<string, string> = {
                name: adName,
                adset_id: adSetId,
                status: status,
                creative: JSON.stringify({ creative_id: creativeId }),
            };

            if (pixelId) {
                adPayload.tracking_specs = JSON.stringify([
                    { 'action.type': ['offsite_conversion'], fb_pixel: [pixelId] },
                ]);
            }

            const adResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/ads`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        access_token: accessToken,
                        ...adPayload,
                    }),
                }
            );

            const adData = await adResponse.json();

            if (!adResponse.ok || adData.error) {
                logger.error('publish', 'Ad creation error (carousel path)', { sid, metaError: serializeMetaError(adData), payload: adPayload });
                return NextResponse.json(
                    {
                        error: adData.error?.message || 'Failed to create carousel ad',
                        errorType: adData.error?.type,
                        errorCode: adData.error?.code,
                        details: adData.error,
                        fullResponse: adData,
                    },
                    { status: adResponse.status || 500 }
                );
            }

            logger.info('publish', 'Ad created (carousel path)', { sid, adId: adData.id, creativeId, adName });

            return NextResponse.json({
                success: true,
                adId: adData.id,
                creativeId,
                adName,
            });

        } else if (isSingleAd) {
            // === SINGLE IMAGE/VIDEO: asset_feed_spec + AdCreative → Ad ===
            // Uses the production-proven pattern: object_story_spec + asset_feed_spec
            // with optimization_type: DEGREES_OF_FREEDOM and is_dynamic_creative: false.
            // Supports multiple bodies/titles (up to 5 each) with a single media asset.

            // Build asset_feed_spec with bodies, titles, and optimization_type
            const assetFeedSpec: Record<string, unknown> = {
                bodies: (primaryTexts as string[]).slice(0, 5).map((text: string) => ({ text })),
                titles: (headlines as string[]).slice(0, 5).map((text: string) => ({ text })),
                optimization_type: 'DEGREES_OF_FREEDOM',
            };

            // Build object_story_spec with lead asset
            const objectStorySpec: Record<string, unknown> = {
                page_id: pageId,
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };

            if (adType === 'single_video' && firstVideoId) {
                objectStorySpec.video_data = {
                    video_id: firstVideoId,
                    call_to_action: {
                        type: callToAction,
                        value: { link: destinationUrl },
                    },
                    ...(videoThumbnailUrl && { image_url: videoThumbnailUrl }),
                };
            } else if (firstImageHash) {
                objectStorySpec.link_data = {
                    link: destinationUrl,
                    image_hash: firstImageHash,
                    call_to_action: {
                        type: callToAction,
                        value: { link: destinationUrl },
                    },
                };
            }

            // Guard: if neither media block was set, the row's asset type doesn't
            // match the ad type (e.g. a single_image row holding only a video) —
            // fail clearly instead of sending a media-less creative Meta rejects.
            if (!objectStorySpec.video_data && !objectStorySpec.link_data) {
                return NextResponse.json(
                    { error: `This ${adType} ad has no usable ${adType === 'single_video' ? 'video' : 'image'} asset — check that the asset type matches the ad type.`, sid },
                    { status: 422 }
                );
            }

            // Build creative payload
            const creativePayload: Record<string, string> = {
                name: `${adName} - Creative`,
                object_story_spec: JSON.stringify(objectStorySpec),
                asset_feed_spec: JSON.stringify(assetFeedSpec),
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };

            // Build degrees_of_freedom_spec for Advantage+ creative enhancements
            const creativeFeatures = buildCreativeFeatures(enhancements, videoIds.length > 0);

            if (Object.keys(creativeFeatures).length > 0) {
                creativePayload.degrees_of_freedom_spec = JSON.stringify({
                    creative_features_spec: creativeFeatures,
                });
            }

            // Add url_tags for tracking
            if (urlParameters) {
                creativePayload.url_tags = urlParameters;
            }

            logger.info('publish', 'Creating AdCreative via asset_feed_spec (single ad)', {
                sid, adType,
                bodiesCount: primaryTexts.length,
                titlesCount: headlines.length,
                hasVideo: !!firstVideoId,
                hasImage: !!firstImageHash,
                instagramActorId: instagramActorId || '(none)',
            });

            // Step 1: Create AdCreative
            const creativeResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/adcreatives`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        access_token: accessToken,
                        ...creativePayload,
                    }),
                }
            );

            const creativeData = await creativeResponse.json();

            if (!creativeResponse.ok || creativeData.error) {
                logger.error('publish', 'AdCreative creation failed', { sid, metaError: serializeMetaError(creativeData), payload: creativePayload });
                return NextResponse.json(
                    {
                        error: creativeData.error?.message || 'Failed to create ad creative',
                        errorType: creativeData.error?.type,
                        errorCode: creativeData.error?.code,
                        details: creativeData.error,
                        fullResponse: creativeData,
                    },
                    { status: creativeResponse.status || 500 }
                );
            }

            const creativeId = creativeData.id;
            logger.info('publish', 'AdCreative created', { sid, creativeId });

            // Step 2: Create Ad referencing the creative
            const adPayload: Record<string, string> = {
                name: adName,
                adset_id: adSetId,
                status: status,
                creative: JSON.stringify({ creative_id: creativeId }),
            };

            // Add tracking specs for pixel
            if (pixelId) {
                adPayload.tracking_specs = JSON.stringify([
                    { 'action.type': ['offsite_conversion'], fb_pixel: [pixelId] },
                ]);
            }

            const adResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/ads`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        access_token: accessToken,
                        ...adPayload,
                    }),
                }
            );

            const adData = await adResponse.json();

            if (!adResponse.ok || adData.error) {
                logger.error('publish', 'Ad creation error (single ad path)', { sid, metaError: serializeMetaError(adData), payload: adPayload });
                return NextResponse.json(
                    {
                        error: adData.error?.message || 'Failed to create ad',
                        errorType: adData.error?.type,
                        errorCode: adData.error?.code,
                        details: adData.error,
                        fullResponse: adData,
                    },
                    { status: adResponse.status || 500 }
                );
            }

            logger.info('publish', 'Ad created (single ad path)', { sid, adId: adData.id, creativeId, adName });

            return NextResponse.json({
                success: true,
                adId: adData.id,
                creativeId,
                adName,
            });

        } else {
            // === FLEXIBLE AD: creative_asset_groups_spec (current path, unchanged) ===

            // Build texts array
            const texts: Array<{ text: string, text_type: string }> = [];
            (primaryTexts as string[]).slice(0, 5).forEach((text: string) => {
                texts.push({ text, text_type: 'primary_text' });
            });
            (headlines as string[]).slice(0, 5).forEach((text: string) => {
                texts.push({ text, text_type: 'headline' });
            });

            // Build the asset group
            const assetGroup: Record<string, unknown> = {
                texts,
                call_to_action: {
                    type: callToAction,
                    value: { link: destinationUrl },
                },
            };

            // Add images
            if (imageHashes.length > 0) {
                assetGroup.images = (imageHashes as string[]).slice(0, 10).map((hash: string) => ({ hash }));
            }

            // Add videos
            if (videoIds.length > 0) {
                assetGroup.videos = (videoIds as string[]).slice(0, 10).map((id: string) => ({ video_id: id }));
            }

            const creativeAssetGroupsSpec = { groups: [assetGroup] };

            // Build creative object with object_story_spec (lead asset reference)
            const creativeObject: Record<string, unknown> = {
                name: `${adName} - Creative`,
                object_story_spec: {
                    page_id: pageId,
                    ...(instagramActorId && { instagram_user_id: instagramActorId }),
                },
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
            };

            const objectStorySpec = creativeObject.object_story_spec as Record<string, unknown>;

            if (firstVideoId && !firstImageHash) {
                objectStorySpec.video_data = {
                    video_id: firstVideoId,
                    message: primaryTexts[0] || adName,
                    ...(videoThumbnailUrl && { image_url: videoThumbnailUrl }),
                    call_to_action: {
                        type: callToAction,
                        value: { link: destinationUrl },
                    },
                };
            } else {
                objectStorySpec.link_data = {
                    link: destinationUrl,
                    ...(firstImageHash && { image_hash: firstImageHash }),
                    call_to_action: {
                        type: callToAction,
                        value: { link: destinationUrl },
                    },
                };
            }

            // Build degrees_of_freedom_spec for Advantage+ creative enhancements
            const creativeFeatures = buildCreativeFeatures(enhancements, videoIds.length > 0);

            if (Object.keys(creativeFeatures).length > 0) {
                creativeObject.degrees_of_freedom_spec = {
                    creative_features_spec: creativeFeatures,
                };
            }

            // Add url_tags for tracking parameters
            if (urlParameters) {
                creativeObject.url_tags = urlParameters;
            }

            const adPayload = {
                name: adName,
                adset_id: adSetId,
                status: status,
                creative: JSON.stringify(creativeObject),
                creative_asset_groups_spec: JSON.stringify(creativeAssetGroupsSpec),
                ...(pixelId ? { tracking_specs: JSON.stringify([{ 'action.type': ['offsite_conversion'], fb_pixel: [pixelId] }]) } : {}),
            };

            logger.info('publish', 'Creating ad via creative_asset_groups_spec (flexible)', {
                sid,
                adType,
                imageCount: imageHashes.length,
                videoCount: videoIds.length,
                primaryTextsCount: primaryTexts.length,
                headlinesCount: headlines.length,
                instagramActorId: instagramActorId || '(none)',
            });

            const adResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/ads`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        access_token: accessToken,
                        ...adPayload,
                    }),
                }
            );

            const adData = await adResponse.json();

            if (!adResponse.ok || adData.error) {
                logger.error('publish', 'Ad creation error (flexible path)', { sid, metaError: serializeMetaError(adData), payload: adPayload });
                return NextResponse.json(
                    {
                        error: adData.error?.message || 'Failed to create ad',
                        errorType: adData.error?.type,
                        errorCode: adData.error?.code,
                        details: adData.error,
                        fullResponse: adData,
                    },
                    { status: adResponse.status || 500 }
                );
            }

            logger.info('publish', 'Ad created (flexible path)', { sid, adId: adData.id, adName });

            return NextResponse.json({
                success: true,
                adId: adData.id,
                adName,
            });
        }

    } catch (error) {
        logger.error('publish', 'Publish error', { error: serializeError(error) });
        return NextResponse.json(
            { error: 'Failed to publish ad', details: String(error) },
            { status: 500 }
        );
    }
}
