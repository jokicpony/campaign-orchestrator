/**
 * Live probe for multi-media ads (creative.media_sourcing_spec) — exercises
 * the SAME payload builder the publish route uses (src/lib/meta/multiMedia.ts).
 * Findings go in docs/MULTI_MEDIA_ADS.md.
 *
 * Token: META_TOKEN env var, or --from-firestore [uid or Meta name] to read
 * serverSecrets/{uid}.meta.accessToken via your gcloud login (uid optional
 * when only one user has a Meta connection). Never printed. The Firebase
 * project comes from NEXT_PUBLIC_FIREBASE_PROJECT_ID (read from .env.local).
 *
 * Usage (Node 22.6+, runs .mts directly):
 *   node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts campaigns
 *       Read-only: recent campaigns per ad account (ids for the commands below).
 *   node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts read <campaignId|adSetId|name fragment>
 *       Read-only: every ad's creative{media_sourcing_spec} under it.
 *   node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts validate <campaignOrAdSetId> <pageId> <link>
 *       validate_only POST of the app's exact payload — Meta checks it, creates NOTHING.
 *   node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts matrix <campaignOrAdSetId> <pageId> <link>
 *       validate_only edge-case matrix (video primary, videos only, enhancements,
 *       Instagram, video/mixed stacks, …) — creates NOTHING.
 *   node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts create <campaignOrAdSetId> <pageId> <link>
 *       Creates ONE real ad, status PAUSED, named "*-DELETE-ME", then reads it back.
 */
import { execFileSync } from 'node:child_process';
import {
    buildMediaSourcingSpec,
    variantTypeFor,
    type MultiMediaItem,
} from '../src/lib/meta/multiMedia.ts';

const GRAPH = 'https://graph.facebook.com/v25.0';

// --from-firestore takes an optional uid; positional args are everything else
const fsFlag = process.argv.indexOf('--from-firestore');
const fsUid = fsFlag >= 0 && process.argv[fsFlag + 1] && !process.argv[fsFlag + 1].startsWith('--')
    ? process.argv[fsFlag + 1]
    : undefined;
const positional = process.argv.slice(2).filter((arg, i) => {
    const idx = i + 2;
    return idx !== fsFlag && !(fsUid && idx === fsFlag + 1);
});

function getToken(): string {
    if (process.env.META_TOKEN) return process.env.META_TOKEN;
    if (fsFlag < 0) throw new Error('Set META_TOKEN or pass --from-firestore [firebaseUid]');

    try { process.loadEnvFile('.env.local'); } catch { /* env may already be set */ }
    const FIRESTORE_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!FIRESTORE_PROJECT) throw new Error('Set NEXT_PUBLIC_FIREBASE_PROJECT_ID (or run from the repo root with .env.local)');
    const gcloud = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
    const firestore = (path: string) => JSON.parse(execFileSync('curl', [
        '-s', '-H', `Authorization: Bearer ${gcloud}`, '-H', `x-goog-user-project: ${FIRESTORE_PROJECT}`,
        `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${path}`,
    ], { encoding: 'utf8' }));

    const docs = firestore('serverSecrets');
    if (docs.error) throw new Error(`Firestore: ${docs.error.message}`);

    type Conn = { uid: string; token?: string; expiresAt?: string; metaUserName?: string };
    const conns: Conn[] = (docs.documents ?? [])
        .map((d: { name: string; fields?: { meta?: { mapValue?: { fields?: Record<string, { stringValue?: string }> } } } }) => {
            const meta = d.fields?.meta?.mapValue?.fields;
            return {
                uid: d.name.split('/').pop() as string,
                token: meta?.accessToken?.stringValue,
                expiresAt: meta?.expiresAt?.stringValue,
            };
        })
        .filter((c: Conn) => c.token);
    // Non-secret Meta user name lives in the client-visible connection metadata
    for (const c of conns) {
        c.metaUserName = firestore(`users/${c.uid}/integrations/meta`).fields?.userName?.stringValue;
    }

    const needle = fsUid?.toLowerCase();
    const matches = needle
        ? conns.filter(c => c.uid === fsUid || c.metaUserName?.toLowerCase().includes(needle))
        : conns;
    if (matches.length !== 1) {
        const list = conns
            .map(c => `  ${c.uid}  ${(c.metaUserName ?? '(no name)').padEnd(24)}  token expires ${c.expiresAt?.slice(0, 10) ?? '?'}`)
            .join('\n');
        throw new Error(conns.length === 0
            ? 'No stored Meta tokens found in serverSecrets'
            : `Pick one with --from-firestore <uid or Meta name>:\n${list}`);
    }
    return matches[0].token!;
}

const token = getToken();

async function graph(path: string, init?: { method?: string; form?: Record<string, string> }) {
    const res = await fetch(`${GRAPH}/${path}`, {
        method: init?.method ?? 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            ...(init?.form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        ...(init?.form && { body: new URLSearchParams(init.form) }),
    });
    return res.json();
}

const show = (label: string, data: unknown) => console.log(`\n== ${label}\n${JSON.stringify(data, null, 2)}`);

async function adAccounts(): Promise<Array<{ id: string; name: string }>> {
    const data = await graph('me/adaccounts?fields=id,name&limit=50');
    if (data.error) throw new Error(JSON.stringify(data.error));
    return data.data ?? [];
}

async function recentCampaigns(accountId: string) {
    const data = await graph(`${accountId}/campaigns?fields=id,name,effective_status,created_time&limit=50`);
    return (data.data ?? []) as Array<{ id: string; name: string; effective_status: string; created_time: string }>;
}

async function listCampaigns() {
    for (const acct of await adAccounts()) {
        console.log(`\n${acct.id}  ${acct.name}`);
        for (const c of (await recentCampaigns(acct.id)).slice(0, 15)) {
            console.log(`  ${c.id}  ${c.created_time.slice(0, 10)}  ${c.effective_status.padEnd(8)}  ${c.name}`);
        }
    }
}

async function read(idOrName: string) {
    if (/^\d+$/.test(idOrName)) return readAds(idOrName);
    // Name fragment → every matching campaign across the user's ad accounts
    const needle = idOrName.toLowerCase();
    let found = 0;
    for (const acct of await adAccounts()) {
        for (const c of await recentCampaigns(acct.id)) {
            if (!c.name.toLowerCase().includes(needle)) continue;
            found++;
            console.log(`\n######## Campaign ${c.id}  ${c.name}`);
            await readAds(c.id);
        }
    }
    if (!found) console.log(`No campaign name contains "${idOrName}". Try: campaigns`);
}

async function readAds(parentId: string) {
    const fields = 'name,effective_status,creative{id,object_type,object_story_spec{page_id},media_sourcing_spec}';
    const data = await graph(`${parentId}/ads?fields=${encodeURIComponent(fields)}&limit=50`);
    if (data.error) return show('ERROR', data.error);
    for (const ad of data.data ?? []) {
        const mss = ad.creative?.media_sourcing_spec;
        console.log(`\n${ad.id}  ${ad.effective_status}  ${ad.name}`);
        console.log(`  page_id=${ad.creative?.object_story_spec?.page_id ?? '?'}  object_type=${ad.creative?.object_type}`);
        console.log(mss
            ? `  media_sourcing_spec: ${mss.images?.length ?? 0} images, ${mss.videos?.length ?? 0} videos\n${JSON.stringify(mss, null, 2).replace(/^/gm, '    ')}`
            : '  media_sourcing_spec: (none)');
    }
}

// Mirrors ENHANCEMENT_KEYS in src/app/api/meta/publish/ad/route.ts — the wizard
// turns all of them on by default, so real publishes carry every one
const ALL_ENHANCEMENTS = [
    'enhance_cta', 'adapt_to_placement', 'product_extensions', 'video_auto_crop',
    'show_summary', 'inline_comment', 'image_brightness_and_contrast',
    'reveal_details_over_time', 'site_extensions', 'text_optimizations',
    'image_animation', 'add_text_overlay', 'image_templates', 'image_touchups',
];

type LibImage = { hash: string; name: string; width: number; height: number };

/**
 * Picks a test set from the account library, stacked the way the app would:
 * stack 0 = square + 9:16 image pair, stack 1 = a second square, then a video.
 */
async function pickMedia(adAccountId: string): Promise<MultiMediaItem[]> {
    const imgs = await graph(`${adAccountId}/adimages?fields=hash,name,width,height&limit=200`);
    if (imgs.error) throw new Error(JSON.stringify(imgs.error));
    const all = (imgs.data ?? []) as LibImage[];
    const square = all.filter(i => variantTypeFor(i.width, i.height) === 'SQUARE').slice(0, 2);
    const vertical = all.filter(i => variantTypeFor(i.width, i.height) === 'FULLSCREEN_VERTICAL').slice(0, 1);
    const fourFive = all.find(i => variantTypeFor(i.width, i.height) === 'VERTICAL');

    const vids = await graph(`${adAccountId}/advideos?fields=id,title,picture,status&limit=25`);
    const video = (vids.data ?? []).find((v: { status?: { video_status?: string }; picture?: string }) =>
        v.status?.video_status === 'ready' && v.picture);

    const asItem = (i: LibImage, stack: number) => ({ type: 'image' as const, hash: i.hash, width: i.width, height: i.height, stack });
    const items: MultiMediaItem[] = [
        ...(square[0] ? [asItem(square[0], 0)] : []),
        ...(vertical[0] ? [asItem(vertical[0], 0)] : []),
        ...(fourFive ? [asItem(fourFive, 0)] : []),
        ...(square[1] ? [asItem(square[1], 1)] : []),
        ...(video ? [{ type: 'video' as const, videoId: video.id, thumbnailUrl: video.picture, stack: 2 }] : []),
    ];
    console.log(`Picked ${square.length} square, ${vertical.length} vertical, ${fourFive ? 1 : 0} 4:5 image(s), ${video ? 1 : 0} video — stack 1 = square + 9:16${fourFive ? ' + 4:5' : ''}`);
    return items;
}

/** Accepts an ad set id, or a campaign id (uses its first ad set). */
async function resolveAdSet(id: string): Promise<string> {
    const sets = await graph(`${id}/adsets?fields=id,name&limit=1`);
    if (!sets.error && sets.data?.[0]) {
        console.log(`Using ad set ${sets.data[0].id} (${sets.data[0].name}) from campaign ${id}`);
        return sets.data[0].id;
    }
    return id;
}

const summarize = (r: { error?: { message?: string; error_user_title?: string; error_user_msg?: string; error_subcode?: number } }) =>
    r.error
        ? `REJECTED — ${r.error.message}${r.error.error_user_title ? ` | ${r.error.error_user_title}` : ''}${r.error.error_user_msg ? ` | ${r.error.error_user_msg}` : ''}${r.error.error_subcode ? ` (subcode ${r.error.error_subcode})` : ''}`
        : `ACCEPTED ${JSON.stringify(r)}`;

async function publish(target: string, pageId: string, link: string, cmd: 'validate' | 'create') {
    const adSetId = await resolveAdSet(target);
    const adSet = await graph(`${adSetId}?fields=account_id,name,is_dynamic_creative,campaign{objective,effective_status}`);
    if (adSet.error) return show('ERROR reading ad set', adSet.error);
    console.log(`Ad set: ${adSet.name}  objective=${adSet.campaign?.objective}  campaign=${adSet.campaign?.effective_status}  dynamic_creative=${adSet.is_dynamic_creative}`);
    const adAccountId = `act_${adSet.account_id}`;

    // Same builder the publish route uses
    const built = buildMediaSourcingSpec({
        items: await pickMedia(adAccountId),
        primaryTexts: ['Multi-media probe primary text A', 'Multi-media probe primary text B'],
        headlines: ['Probe headline A', 'Probe headline B'],
    });
    const primary = built.items[0];
    if (!primary) return console.log('No usable media in the account library.');
    console.log(`${built.items.length} media, ${built.groupCount} image group(s)`);

    // Real publish shape: Instagram identity + every wizard-default enhancement
    const ig = (await graph(`${pageId}?fields=instagram_business_account`)).instagram_business_account?.id as string | undefined;
    const cta = { type: 'LEARN_MORE', value: { link } };
    const creative = {
        name: 'MM probe - Creative-DELETE-ME',
        ...(ig && { instagram_user_id: ig }),
        degrees_of_freedom_spec: {
            creative_features_spec: Object.fromEntries(ALL_ENHANCEMENTS.map(k => [k, { enroll_status: 'OPT_IN' }])),
        },
        object_story_spec: {
            page_id: pageId,
            ...(ig && { instagram_user_id: ig }),
            ...(primary.type === 'video'
                ? { video_data: { video_id: primary.videoId, image_url: primary.thumbnailUrl, call_to_action: cta } }
                : { link_data: { link, image_hash: primary.hash, call_to_action: cta } }),
        },
        media_sourcing_spec: built.spec,
    };
    if (process.argv.includes('--verbose') || cmd === 'create') show('creative payload', creative);

    const result = await graph(`${adAccountId}/ads`, {
        method: 'POST',
        form: {
            name: `MM probe ${new Date().toISOString().slice(0, 16)}-DELETE-ME`,
            adset_id: adSetId,
            status: 'PAUSED',
            creative: JSON.stringify(creative),
            ...(cmd === 'validate' && { execution_options: JSON.stringify(['validate_only']) }),
        },
    });
    console.log(`\n[${cmd}] ${summarize(result)}`);

    if (cmd === 'create' && result.id) {
        const back = await graph(`${result.id}?fields=${encodeURIComponent('name,status,creative{id,media_sourcing_spec,degrees_of_freedom_spec}')}`);
        show('read-back', back);
        const stored = back.creative?.media_sourcing_spec;
        const ours = [...(stored?.images ?? []), ...(stored?.videos ?? [])]
            .filter((m: { source?: string }) => m.source === 'multi_media');
        const groups = new Set((stored?.images ?? []).map((m: { group_id?: string }) => m.group_id).filter(Boolean));
        const metaAdded = [...(stored?.images ?? []), ...(stored?.videos ?? [])]
            .filter((m: { source?: string }) => m.source !== 'multi_media')
            .map((m: { source?: string; opt_in_status?: string }) => `${m.source}/${m.opt_in_status ?? '-'}`);
        console.log(`\nMedia sent: ${built.items.length}, persisted as multi_media: ${ours.length}; image groups sent: ${built.groupCount}, persisted: ${groups.size}`);
        console.log(`Meta-added items: ${metaAdded.length ? metaAdded.join(', ') : 'none'}`);
        console.log(`Enhancements persisted: ${Object.keys(back.creative?.degrees_of_freedom_spec?.creative_features_spec ?? {}).length}`);
        console.log(`Ad ${result.id} is PAUSED. Delete it when done (Ads Manager, or: curl -X DELETE -H "Authorization: Bearer <token>" ${GRAPH}/${result.id})`);
    }
}


/**
 * validate_only matrix of image/video edge cases — creates NOTHING. Each case
 * is the app's payload shape (or a deliberate variation to learn Meta's rules).
 */
async function matrix(target: string, pageId: string, link: string) {
    const adSetId = await resolveAdSet(target);
    const adSet = await graph(`${adSetId}?fields=account_id,name,campaign{objective}`);
    if (adSet.error) return show('ERROR reading ad set', adSet.error);
    const adAccountId = `act_${adSet.account_id}`;
    console.log(`Ad set: ${adSet.name}  objective=${adSet.campaign?.objective}`);

    const imgs = ((await graph(`${adAccountId}/adimages?fields=hash,width,height&limit=200`)).data ?? []) as LibImage[];
    const square = imgs.filter(i => variantTypeFor(i.width, i.height) === 'SQUARE').slice(0, 2);
    const vertical = imgs.filter(i => variantTypeFor(i.width, i.height) === 'FULLSCREEN_VERTICAL').slice(0, 1);
    const fourFive = imgs.find(i => variantTypeFor(i.width, i.height) === 'VERTICAL');
    const wide = imgs.find(i => variantTypeFor(i.width, i.height) === 'HORIZONTAL');
    const videos = ((await graph(`${adAccountId}/advideos?fields=id,picture,status&limit=25`)).data ?? [])
        .filter((v: { status?: { video_status?: string }; picture?: string }) => v.status?.video_status === 'ready' && v.picture)
        .slice(0, 2) as Array<{ id: string; picture: string }>;
    const ig = (await graph(`${pageId}?fields=instagram_business_account`)).instagram_business_account?.id as string | undefined;
    console.log(`Library: ${square.length} square, ${vertical.length} vertical, ${fourFive ? 1 : 0} 4:5, ${wide ? 1 : 0} wide, ${videos.length} ready video(s); page IG account: ${ig ?? 'none'}`);
    if (square.length < 2 || vertical.length < 1 || videos.length < 2) {
        return console.log('Need 2 square images, 1 vertical image, and 2 ready videos in the ad account library for the full matrix.');
    }

    const img = (i: LibImage, stack: number): MultiMediaItem => ({ type: 'image', hash: i.hash, width: i.width, height: i.height, stack });
    const vid = (v: { id: string; picture: string }, stack: number): MultiMediaItem => ({ type: 'video', videoId: v.id, thumbnailUrl: v.picture, stack });
    const texts = { primaryTexts: ['Probe primary A', 'Probe primary B'], headlines: ['Probe headline A', 'Probe headline B'] };
    const spec = (items: MultiMediaItem[]) => buildMediaSourcingSpec({ items, ...texts });

    type Case = { name: string; items: MultiMediaItem[]; mutate?: (s: Record<string, unknown>) => void; enhancements?: boolean; instagram?: boolean; skip?: string };
    const baseline = [img(square[0], 0), img(vertical[0], 0), img(square[1], 1), vid(videos[0], 2)];
    const cases: Case[] = [
        { name: 'A  image primary, 1 stack + solo image + video (app baseline)', items: baseline },
        { name: 'B  video primary + images', items: [vid(videos[0], 0), img(square[0], 1), img(vertical[0], 1)] },
        { name: 'C  videos only (2)', items: [vid(videos[0], 0), vid(videos[1], 1)] },
        { name: 'D  single image only', items: [img(square[0], 0)] },
        { name: 'E  single video only', items: [vid(videos[0], 0)] },
        { name: 'F  baseline + all 14 enhancements (wizard default)', items: baseline, enhancements: true },
        { name: 'G  baseline + instagram_user_id', items: baseline, instagram: true },
        { name: 'H  baseline + enhancements + instagram (real publish shape)', items: baseline, enhancements: true, instagram: true },
        {
            name: 'I  [learn] 2 videos stacked (shared group_id + variant_types)',
            items: [img(square[0], 0), vid(videos[0], 1), vid(videos[1], 1)],
            mutate: s => {
                const g = crypto.randomUUID();
                (s.videos as Array<Record<string, unknown>>).forEach((v, k) => Object.assign(v, { group_id: g, variant_types: [k === 0 ? 'SQUARE' : 'FULLSCREEN_VERTICAL'] }));
            },
        },
        {
            name: 'J  [learn] image + video in ONE stack',
            items: [img(square[0], 0), vid(videos[0], 0)],
            mutate: s => {
                const g = (s.images as Array<Record<string, unknown>>)[0].group_id;
                Object.assign((s.videos as Array<Record<string, unknown>>)[0], { group_id: g, variant_types: ['FULLSCREEN_VERTICAL'] });
            },
        },
        {
            name: 'L  3-shape stack: 1:1 + 4:5 (VERTICAL) + 9:16',
            items: fourFive ? [img(square[0], 0), img(fourFive, 0), img(vertical[0], 0)] : [],
            skip: fourFive ? undefined : 'no 4:5 image in library',
        },
        {
            name: 'M  stack with a wide image (HORIZONTAL) + 9:16',
            items: wide ? [img(wide, 0), img(vertical[0], 0)] : [],
            skip: wide ? undefined : 'no wide image in library',
        },
        {
            name: 'K  [learn] image with NO variant_types (unknown size)',
            items: [img(square[0], 0), img(vertical[0], 1)],
            mutate: s => { delete (s.images as Array<Record<string, unknown>>)[1].variant_types; },
        },
    ];

    for (const c of cases) {
        if (c.skip) { console.log(`\n${c.name}\n   SKIPPED — ${c.skip}`); continue; }
        if (c.instagram && !ig) { console.log(`\n${c.name}\n   SKIPPED — page has no Instagram account`); continue; }
        const built = spec(c.items);
        c.mutate?.(built.spec);
        const primary = built.items[0];
        const cta = { type: 'LEARN_MORE', value: { link } };
        const creative: Record<string, unknown> = {
            name: 'MM matrix-DELETE-ME',
            object_story_spec: {
                page_id: pageId,
                ...(c.instagram && { instagram_user_id: ig }),
                ...(primary.type === 'video'
                    ? { video_data: { video_id: primary.videoId, image_url: primary.thumbnailUrl, call_to_action: cta } }
                    : { link_data: { link, image_hash: primary.hash, call_to_action: cta } }),
            },
            media_sourcing_spec: built.spec,
            ...(c.instagram && { instagram_user_id: ig }),
            ...(c.enhancements && {
                degrees_of_freedom_spec: {
                    creative_features_spec: Object.fromEntries(ALL_ENHANCEMENTS.map(k => [k, { enroll_status: 'OPT_IN' }])),
                },
            }),
        };
        const result = await graph(`${adAccountId}/ads`, {
            method: 'POST',
            form: {
                name: 'MM matrix-DELETE-ME',
                adset_id: adSetId,
                status: 'PAUSED',
                creative: JSON.stringify(creative),
                execution_options: JSON.stringify(['validate_only']),
            },
        });
        console.log(`\n${c.name}\n   ${summarize(result)}`);
    }
}

const [cmd, a, b, c] = positional;
if (cmd === 'campaigns') await listCampaigns();
else if (cmd === 'matrix' && a && b && c) await matrix(a, b, c);
else if (cmd === 'read' && a) await read(a);
else if ((cmd === 'validate' || cmd === 'create') && a && b && c) await publish(a, b, c, cmd);
else console.log('Usage: campaigns | matrix <campaignOrAdSetId> <pageId> <link> | read <campaignId|adSetId|name fragment> | validate <campaignOrAdSetId> <pageId> <link> [--verbose] | create <campaignOrAdSetId> <pageId> <link>  [--from-firestore [uid]]');
