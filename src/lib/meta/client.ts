/**
 * Meta Marketing API Client
 * 
 * Handles all interactions with Meta's Graph API for marketing purposes.
 * Used server-side only to protect access tokens.
 */

import {
    MetaAdAccount,
    MetaAdInsight,
    MetaAdCreative,
    MetaTopPerformer,
    TopPerformersOptions,
    MetaTokenResponse,
    MetaApiError,
    MetaPage,
    MetaCampaign,
    MetaAdSet,
} from './types';
import { logger, serializeError } from '@/lib/logger';
import { GRAPH_API_BASE } from './constants';

/**
 * Check if response is a Meta API error
 */
function isMetaError(data: unknown): data is MetaApiError {
    return typeof data === 'object' && data !== null && 'error' in data;
}

/**
 * Make authenticated request to Meta Graph API
 */
async function graphFetch<T>(
    endpoint: string,
    accessToken: string,
    options?: RequestInit
): Promise<T> {
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${GRAPH_API_BASE}${endpoint}`;

    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}access_token=${accessToken}`;

    const response = await fetch(fullUrl, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    const data = await response.json();

    if (isMetaError(data)) {
        logger.error('meta', 'API Error', { error: data.error });
        throw new Error(`Meta API Error: ${data.error.message}`);
    }

    return data as T;
}

/**
 * Exchange short-lived token for long-lived token
 */
export async function exchangeForLongLivedToken(
    shortLivedToken: string,
    appId: string,
    appSecret: string
): Promise<MetaTokenResponse> {
    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
    });

    const response = await fetch(
        `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`
    );

    const data = await response.json();

    if (isMetaError(data)) {
        throw new Error(`Token exchange failed: ${data.error.message}`);
    }

    return data as MetaTokenResponse;
}

/**
 * Get user info from access token
 */
export async function getUserInfo(
    accessToken: string
): Promise<{ id: string; name: string }> {
    return graphFetch<{ id: string; name: string }>(
        '/me?fields=id,name',
        accessToken
    );
}

/**
 * Get all ad accounts accessible by the user
 */
export async function getAdAccounts(
    accessToken: string
): Promise<MetaAdAccount[]> {
    interface AdAccountData {
        id: string;
        account_id: string;
        name: string;
        business_name?: string;
        currency: string;
        timezone_id: number;
        timezone_name: string;
    }

    interface AdAccountsResponse {
        data: AdAccountData[];
        paging?: { next?: string };
    }

    const accounts: MetaAdAccount[] = [];
    let nextUrl: string | null = '/me/adaccounts?fields=id,account_id,name,business_name,currency,timezone_id,timezone_name&limit=100';

    while (nextUrl) {
        const result: AdAccountsResponse = await graphFetch<AdAccountsResponse>(nextUrl, accessToken);

        accounts.push(
            ...result.data.map((acc: AdAccountData) => ({
                id: acc.id,
                accountId: acc.account_id,
                name: acc.name,
                businessName: acc.business_name,
                currency: acc.currency,
                timezoneId: acc.timezone_id,
                timezoneName: acc.timezone_name,
            }))
        );

        nextUrl = result.paging?.next || null;
    }

    return accounts;
}

/**
 * Get top performing ads by spend with their insights (without breakdown)
 * Used as fallback for non-Dynamic Creative ads
 */
export async function getTopPerformingAds(
    accessToken: string,
    options: TopPerformersOptions
): Promise<MetaAdInsight[]> {
    const { adAccountId, datePreset = 'last_90d', limit = 50, sortBy = 'spend' } = options;

    // Build fields for insights request
    const insightFields = [
        'ad_id',
        'ad_name',
        'campaign_id',
        'campaign_name',
        'adset_id',
        'adset_name',
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'cpc',
        'reach',
    ].join(',');

    const params = new URLSearchParams({
        level: 'ad',
        fields: insightFields,
        date_preset: datePreset,
        sort: `${sortBy}_descending`,
        limit: limit.toString(),
        filtering: JSON.stringify([
            { field: 'spend', operator: 'GREATER_THAN', value: '0' }
        ]),
    });

    interface InsightsResponse {
        data: Array<{
            ad_id: string;
            ad_name: string;
            campaign_id: string;
            campaign_name: string;
            adset_id: string;
            adset_name: string;
            spend: string;
            impressions: string;
            clicks: string;
            ctr: string;
            cpc: string;
            reach: string;
        }>;
    }

    const response = await graphFetch<InsightsResponse>(
        `/${adAccountId}/insights?${params.toString()}`,
        accessToken
    );

    return response.data.map((insight) => ({
        adId: insight.ad_id,
        adName: insight.ad_name,
        campaignId: insight.campaign_id,
        campaignName: insight.campaign_name,
        adsetId: insight.adset_id,
        adsetName: insight.adset_name,
        spend: parseFloat(insight.spend) || 0,
        impressions: parseInt(insight.impressions) || 0,
        clicks: parseInt(insight.clicks) || 0,
        ctr: parseFloat(insight.ctr) || 0,
        cpc: parseFloat(insight.cpc) || 0,
        reach: parseInt(insight.reach) || 0,
    }));
}

/**
 * Asset breakdown result from insights API
 */
interface AssetBreakdownInsight {
    adId: string;
    adName: string;
    campaignId: string;
    campaignName: string;
    assetId: string;
    spend: number;
    impressions: number;
    clicks: number;
}

/**
 * Get insights with asset breakdown (body_asset or title_asset)
 */
async function getInsightsWithAssetBreakdown(
    accessToken: string,
    adAccountId: string,
    breakdown: 'body_asset' | 'title_asset',
    datePreset: string,
    limit: number
): Promise<AssetBreakdownInsight[]> {
    const insightFields = [
        'ad_id',
        'ad_name',
        'campaign_id',
        'campaign_name',
        'spend',
        'impressions',
        'clicks',
    ].join(',');

    const params = new URLSearchParams({
        level: 'ad',
        fields: insightFields,
        date_preset: datePreset,
        breakdowns: breakdown,
        sort: 'spend_descending',
        limit: limit.toString(),
        filtering: JSON.stringify([
            { field: 'spend', operator: 'GREATER_THAN', value: '0' }
        ]),
    });

    interface BreakdownResponse {
        data: Array<{
            ad_id: string;
            ad_name: string;
            campaign_id: string;
            campaign_name: string;
            [key: string]: string; // body_asset or title_asset
            spend: string;
            impressions: string;
            clicks: string;
        }>;
    }

    try {
        const response = await graphFetch<BreakdownResponse>(
            `/${adAccountId}/insights?${params.toString()}`,
            accessToken
        );

        logger.debug('meta', `${breakdown} breakdown`, { rowCount: response.data.length });

        if (response.data.length > 0) {
            logger.debug('meta', `Sample ${breakdown} asset ID`, { assetId: response.data[0][breakdown] });
        }

        const results = response.data
            .filter(row => row[breakdown]) // Only include rows with the asset breakdown
            .map((row) => ({
                adId: row.ad_id,
                adName: row.ad_name,
                campaignId: row.campaign_id,
                campaignName: row.campaign_name,
                assetId: row[breakdown],
                spend: parseFloat(row.spend) || 0,
                impressions: parseInt(row.impressions) || 0,
                clicks: parseInt(row.clicks) || 0,
            }));

        logger.debug('meta', `${breakdown} breakdown results`, { count: results.length });
        return results;
    } catch (error) {
        logger.error('meta', `Failed to get ${breakdown} breakdown`, { error: serializeError(error) });
        return [];
    }
}

/**
 * Get asset feed spec for ads to resolve asset IDs to text
 */
async function getAssetFeedSpecs(
    accessToken: string,
    adIds: string[]
): Promise<Map<string, { bodies: Map<string, string>; titles: Map<string, string>; adName: string; campaignName: string }>> {
    const assetFeeds = new Map<string, { bodies: Map<string, string>; titles: Map<string, string>; adName: string; campaignName: string }>();

    // Batch requests in groups of 25 to avoid rate limits
    const batchSize = 25;
    for (let i = 0; i < adIds.length; i += batchSize) {
        const batch = adIds.slice(i, i + batchSize);

        const promises = batch.map(async (adId) => {
            try {
                interface AssetItem {
                    text?: string;
                    hash?: string;
                    url_tags?: string;
                }

                interface AdWithAssetFeed {
                    id: string;
                    name: string;
                    campaign?: { name: string };
                    creative?: {
                        id: string;
                        asset_feed_spec?: {
                            bodies?: AssetItem[];
                            titles?: AssetItem[];
                        };
                        // For non-dynamic creatives
                        body?: string;
                        title?: string;
                        object_story_spec?: {
                            link_data?: {
                                message?: string;
                                name?: string;
                                // Carousel cards — headlines live per-card here
                                child_attachments?: Array<{ name?: string }>;
                            };
                            video_data?: { message?: string; title?: string };
                        };
                    };
                }

                const response = await graphFetch<AdWithAssetFeed>(
                    `/${adId}?fields=id,name,campaign{name},creative{id,body,title,asset_feed_spec,object_story_spec}`,
                    accessToken
                );

                const bodies = new Map<string, string>();
                const titles = new Map<string, string>();
                const creative = response.creative;

                if (creative?.asset_feed_spec) {
                    // Dynamic Creative - map by both index AND hash (Meta uses hash in breakdown response)
                    creative.asset_feed_spec.bodies?.forEach((body, idx) => {
                        if (body.text) {
                            // Map by index
                            bodies.set(String(idx), body.text);
                            // Also map by hash if available
                            if (body.hash) {
                                bodies.set(body.hash, body.text);
                            }
                        }
                    });
                    creative.asset_feed_spec.titles?.forEach((title, idx) => {
                        if (title.text) {
                            // Map by index
                            titles.set(String(idx), title.text);
                            // Also map by hash if available
                            if (title.hash) {
                                titles.set(title.hash, title.text);
                            }
                        }
                    });

                    logger.debug('meta', `Ad ${adId} asset_feed_spec`, { bodiesCount: bodies.size, titlesCount: titles.size });
                } else if (creative) {
                    // Non-dynamic creative - single body/title
                    const bodyText = creative.body ||
                        creative.object_story_spec?.link_data?.message ||
                        creative.object_story_spec?.video_data?.message;
                    const titleText = creative.title ||
                        creative.object_story_spec?.link_data?.name ||
                        creative.object_story_spec?.video_data?.title;

                    // For non-DC ads, use '0' as fallback and also try empty string
                    if (bodyText) {
                        bodies.set('0', bodyText);
                        bodies.set('', bodyText);
                    }
                    if (titleText) {
                        titles.set('0', titleText);
                        titles.set('', titleText);
                    }

                    // Carousel creatives keep headlines per-card in child_attachments
                    const childAttachments = creative.object_story_spec?.link_data?.child_attachments;
                    if (childAttachments?.length) {
                        childAttachments.forEach((card, idx) => {
                            if (card.name) titles.set(String(idx), card.name);
                        });
                        const firstCardName = childAttachments.find(c => c.name)?.name;
                        if (firstCardName && !titles.has('')) {
                            titles.set('', firstCardName);
                        }
                    }
                }

                assetFeeds.set(adId, {
                    bodies,
                    titles,
                    adName: response.name,
                    campaignName: response.campaign?.name || '',
                });
            } catch (error) {
                logger.error('meta', `Failed to fetch asset feed for ad ${adId}`, { error: serializeError(error) });
            }
        });

        await Promise.all(promises);
    }

    return assetFeeds;
}

/**
 * Get creative details for specific ads (fallback for non-DC ads)
 */
export async function getAdCreatives(
    accessToken: string,
    adIds: string[]
): Promise<Map<string, MetaAdCreative>> {
    const creatives = new Map<string, MetaAdCreative>();

    // Batch requests in groups of 50 (Meta API limit)
    const batchSize = 50;
    for (let i = 0; i < adIds.length; i += batchSize) {
        const batch = adIds.slice(i, i + batchSize);

        // Fetch each ad's creative
        const promises = batch.map(async (adId) => {
            try {
                interface AdCreativeResponse {
                    id: string;
                    creative: {
                        id: string;
                        name?: string;
                        body?: string;
                        title?: string;
                        call_to_action_type?: string;
                        object_story_spec?: {
                            link_data?: {
                                message?: string;
                                name?: string;
                                link?: string;
                                call_to_action?: { type?: string };
                                // Carousel cards — headlines live per-card here
                                child_attachments?: Array<{ name?: string }>;
                            };
                            video_data?: {
                                message?: string;
                                title?: string;
                                link_url?: string;
                                call_to_action?: { type?: string };
                            };
                        };
                        effective_object_story_id?: string;
                        thumbnail_url?: string;
                    };
                }

                const response = await graphFetch<AdCreativeResponse>(
                    `/${adId}?fields=creative{id,name,body,title,call_to_action_type,object_story_spec,thumbnail_url}`,
                    accessToken
                );

                const creative = response.creative;
                const storySpec = creative.object_story_spec;
                const linkData = storySpec?.link_data;
                const videoData = storySpec?.video_data;

                creatives.set(adId, {
                    id: creative.id,
                    name: creative.name,
                    body: creative.body || linkData?.message || videoData?.message,
                    // Carousels have no top-level title — represent the deck's
                    // per-card headlines joined in order
                    title: creative.title || linkData?.name || videoData?.title ||
                        (linkData?.child_attachments?.map(c => c.name).filter(Boolean).join(' | ') || undefined),
                    callToActionType: creative.call_to_action_type ||
                        linkData?.call_to_action?.type ||
                        videoData?.call_to_action?.type,
                    linkUrl: linkData?.link || videoData?.link_url,
                    thumbnailUrl: creative.thumbnail_url,
                });
            } catch (error) {
                logger.error('meta', `Failed to fetch creative for ad ${adId}`, { error: serializeError(error) });
            }
        });

        await Promise.all(promises);
    }

    return creatives;
}

/**
 * Get top performers with asset-level breakdowns for Dynamic Creative
 * Combines insights + creative asset data for accurate copy attribution
 */
export async function getTopPerformers(
    accessToken: string,
    options: TopPerformersOptions
): Promise<MetaTopPerformer[]> {
    const { adAccountId, datePreset = 'last_90d', limit = 200 } = options;

    // Step 1: Get insights with body_asset breakdown (primary text)
    const bodyInsights = await getInsightsWithAssetBreakdown(
        accessToken,
        adAccountId,
        'body_asset',
        datePreset,
        limit
    );

    // Step 2: Get insights with title_asset breakdown (headline)
    const titleInsights = await getInsightsWithAssetBreakdown(
        accessToken,
        adAccountId,
        'title_asset',
        datePreset,
        limit
    );

    // Step 3: Collect unique ad IDs to fetch asset texts
    const allAdIds = new Set<string>();
    bodyInsights.forEach(i => allAdIds.add(i.adId));
    titleInsights.forEach(i => allAdIds.add(i.adId));

    // Step 4: Fetch asset feed specs to resolve asset IDs to text
    const assetFeeds = await getAssetFeedSpecs(accessToken, Array.from(allAdIds));

    // Step 5: Build results with actual copy text
    const results: MetaTopPerformer[] = [];

    logger.debug('meta', 'Processing asset insights', { bodyCount: bodyInsights.length, titleCount: titleInsights.length, feedCount: assetFeeds.size });

    // Process body (primary text) insights
    bodyInsights.forEach(insight => {
        const feed = assetFeeds.get(insight.adId);
        const bodyText = feed?.bodies.get(insight.assetId);

        // Debug: Log when we can't find a body text
        if (!bodyText && feed) {
            logger.debug('meta', `Could not resolve body asset ID`, { assetId: insight.assetId, availableKeys: Array.from(feed.bodies.keys()).slice(0, 5) });
        }

        if (bodyText) {
            results.push({
                adId: insight.adId,
                adName: insight.adName,
                campaignName: insight.campaignName,
                primaryText: bodyText,
                headline: null, // This is a body breakdown, no headline
                callToAction: null,
                destinationUrl: null,
                spend: insight.spend,
                impressions: insight.impressions,
                clicks: insight.clicks,
                ctr: insight.impressions > 0 ? (insight.clicks / insight.impressions) * 100 : 0,
            });
        }
    });

    // Process title (headline) insights
    titleInsights.forEach(insight => {
        const feed = assetFeeds.get(insight.adId);
        const titleText = feed?.titles.get(insight.assetId);

        // Debug: Log when we can't find a title text
        if (!titleText && feed) {
            logger.debug('meta', `Could not resolve title asset ID`, { assetId: insight.assetId, availableKeys: Array.from(feed.titles.keys()).slice(0, 5) });
        }

        if (titleText) {
            results.push({
                adId: insight.adId,
                adName: insight.adName,
                campaignName: insight.campaignName,
                primaryText: null, // This is a title breakdown, no primary text
                headline: titleText,
                callToAction: null,
                destinationUrl: null,
                spend: insight.spend,
                impressions: insight.impressions,
                clicks: insight.clicks,
                ctr: insight.impressions > 0 ? (insight.clicks / insight.impressions) * 100 : 0,
            });
        }
    });

    logger.info('meta', `Resolved ${results.length} results from asset breakdowns`);

    // Step 6: If no asset breakdowns found, fall back to ad-level query
    if (results.length === 0) {
        logger.info('meta', 'Falling back to ad-level query — no asset breakdowns found');
        const insights = await getTopPerformingAds(accessToken, options);
        const adIds = insights.map(i => i.adId);
        const creatives = await getAdCreatives(accessToken, adIds);

        return insights.map(insight => {
            const creative = creatives.get(insight.adId);
            return {
                adId: insight.adId,
                adName: insight.adName,
                campaignName: insight.campaignName,
                primaryText: creative?.body || null,
                headline: creative?.title || null,
                callToAction: creative?.callToActionType || null,
                destinationUrl: creative?.linkUrl || null,
                spend: insight.spend,
                impressions: insight.impressions,
                clicks: insight.clicks,
                ctr: insight.ctr,
                roas: insight.roas,
            };
        });
    }

    // Sort by spend descending
    results.sort((a, b) => b.spend - a.spend);

    return results;
}

/**
 * Check if a token is still valid
 */
export async function validateToken(accessToken: string): Promise<boolean> {
    try {
        await getUserInfo(accessToken);
        return true;
    } catch {
        return false;
    }
}

// ============================================================================
// PUBLISHING API FUNCTIONS (Phase 7: Meta Direct Publish)
// ============================================================================

/**
 * Get Facebook Pages accessible by the user
 * Required for publishing ads (ads must be associated with a Page)
 * Also fetches the linked Instagram Business Account ID for ad creation.
 * The instagram_business_account.id is the Graph API node ID that the
 * Marketing API expects for instagram_actor_id / instagram_user_id.
 */
export async function getPages(accessToken: string): Promise<MetaPage[]> {
    interface PageData {
        id: string;
        name: string;
        instagram_business_account?: { id: string };
    }

    interface PagesResponse {
        data: PageData[];
        paging?: { next?: string };
    }

    const pages: MetaPage[] = [];
    // NOTE: deliberately does NOT request access_token. Page tokens are
    // credentials and nothing consumes them — fetching them only risks leaking
    // them into the client (the connection metadata travels to the browser).
    let nextUrl: string | null = '/me/accounts?fields=id,name,instagram_business_account&limit=100';

    while (nextUrl) {
        const result: PagesResponse = await graphFetch<PagesResponse>(nextUrl, accessToken);

        pages.push(
            ...result.data.map((page: PageData) => ({
                id: page.id,
                name: page.name,
                instagramAccountId: page.instagram_business_account?.id,
            }))
        );

        nextUrl = result.paging?.next || null;
    }

    return pages;
}

/**
 * Get Instagram accounts connected to an ad account.
 * 
 * IMPORTANT: The Pages API `instagram_business_account.id` returns a Facebook
 * Graph node ID (e.g. 17841403278646568) which is NOT the Instagram actor ID
 * that the Marketing API expects. This endpoint returns the correct IDs that
 * match what Ads Manager displays (e.g. 1151534888198362).
 */
export async function getInstagramAccounts(
    accessToken: string,
    adAccountId: string
): Promise<Array<{ id: string; username?: string }>> {
    interface IGAccountData {
        id: string;
        username?: string;
    }

    interface IGAccountsResponse {
        data: IGAccountData[];
    }

    try {
        const result = await graphFetch<IGAccountsResponse>(
            `/${adAccountId}/instagram_accounts?fields=id,username`,
            accessToken
        );

        return result.data || [];
    } catch (error) {
        logger.warn('meta', 'Failed to fetch Instagram accounts for ad account', {
            adAccountId,
            error: serializeError(error),
        });
        return [];
    }
}

/**
 * Get campaigns for an ad account
 * Used in Publish Wizard to select existing campaigns
 */
export async function getCampaigns(
    accessToken: string,
    adAccountId: string,
    statusFilter: ('ACTIVE' | 'PAUSED')[] = ['ACTIVE', 'PAUSED']
): Promise<MetaCampaign[]> {
    interface CampaignData {
        id: string;
        name: string;
        status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
        objective: string;
        daily_budget?: string;
        lifetime_budget?: string;
    }

    interface CampaignsResponse {
        data: CampaignData[];
        paging?: { next?: string };
    }

    const campaigns: MetaCampaign[] = [];

    // Build filtering for status
    const filtering = JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: statusFilter }
    ]);

    let nextUrl: string | null = `/${adAccountId}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&filtering=${encodeURIComponent(filtering)}&limit=100`;

    while (nextUrl) {
        const result: CampaignsResponse = await graphFetch<CampaignsResponse>(nextUrl, accessToken);

        campaigns.push(
            ...result.data.map((campaign: CampaignData) => ({
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                objective: campaign.objective,
                dailyBudget: campaign.daily_budget ? parseInt(campaign.daily_budget) : undefined,
                lifetimeBudget: campaign.lifetime_budget ? parseInt(campaign.lifetime_budget) : undefined,
            }))
        );

        nextUrl = result.paging?.next || null;
    }

    return campaigns;
}

/**
 * Get ad sets for a campaign
 * Used in Publish Wizard to select existing ad sets
 */
export async function getAdSets(
    accessToken: string,
    campaignId: string,
    statusFilter: ('ACTIVE' | 'PAUSED')[] = ['ACTIVE', 'PAUSED']
): Promise<MetaAdSet[]> {
    interface AdSetData {
        id: string;
        name: string;
        campaign_id: string;
        status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
        daily_budget?: string;
        lifetime_budget?: string;
        optimization_goal?: string;
        billing_event?: string;
    }

    interface AdSetsResponse {
        data: AdSetData[];
        paging?: { next?: string };
    }

    const adSets: MetaAdSet[] = [];

    // Build filtering for status
    const filtering = JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: statusFilter }
    ]);

    let nextUrl: string | null = `/${campaignId}/adsets?fields=id,name,campaign_id,status,daily_budget,lifetime_budget,optimization_goal,billing_event&filtering=${encodeURIComponent(filtering)}&limit=100`;

    while (nextUrl) {
        const result: AdSetsResponse = await graphFetch<AdSetsResponse>(nextUrl, accessToken);

        adSets.push(
            ...result.data.map((adSet: AdSetData) => ({
                id: adSet.id,
                name: adSet.name,
                campaignId: adSet.campaign_id,
                status: adSet.status,
                dailyBudget: adSet.daily_budget ? parseInt(adSet.daily_budget) : undefined,
                lifetimeBudget: adSet.lifetime_budget ? parseInt(adSet.lifetime_budget) : undefined,
                optimizationGoal: adSet.optimization_goal,
                billingEvent: adSet.billing_event,
            }))
        );

        nextUrl = result.paging?.next || null;
    }

    return adSets;
}
