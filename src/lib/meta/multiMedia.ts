/**
 * Multi-media ads (creative.media_sourcing_spec) — Meta's documented successor
 * for "Single image or video" ads carrying an uploaded media group: up to 10
 * images + videos in ONE ad. See docs/META_API.md.
 *
 * Pure + client-safe: the builder row and publish wizard use buildStacks to
 * show/rename stacks, and the publish route builds the payload with
 * buildMediaSourcingSpec — so what you see is what publishes.
 *
 * Orientation model (as Ads Manager writes it, live-validated Oct 2026):
 * variants of one creative are images sharing a `group_id`, each tagged with
 * `variant_types` (SQUARE, FULLSCREEN_VERTICAL, …). Meta picks the variant
 * that fits each placement. Videos carry no group/variant fields.
 */

export const MULTI_MEDIA_MAX_ASSETS = 10;

export type VariantType = 'FULLSCREEN_VERTICAL' | 'VERTICAL' | 'SQUARE' | 'HORIZONTAL';

/**
 * Aspect ratio → Meta variant type. SQUARE and FULLSCREEN_VERTICAL are what
 * Ads Manager writes; VERTICAL (4:5) and HORIZONTAL (1.91:1 / 16:9) are valid
 * enum values whose exact semantics Meta doesn't document.
 */
export function variantTypeFor(width?: number, height?: number): VariantType | undefined {
    if (!width || !height) return undefined;
    const ratio = width / height;
    if (ratio < 0.7) return 'FULLSCREEN_VERTICAL'; // 9:16
    if (ratio < 0.9) return 'VERTICAL';            // 4:5
    if (ratio <= 1.1) return 'SQUARE';             // 1:1
    return 'HORIZONTAL';                           // 1.91:1, 16:9
}

/** Display label per variant */
export const VARIANT_LABELS: Record<VariantType, string> = {
    FULLSCREEN_VERTICAL: '9:16',
    VERTICAL: '4:5',
    SQUARE: '1:1',
    HORIZONTAL: 'Wide',
};

/** Shape label for any asset ("9:16", "4:5", "1:1", "Wide") — one rule app-wide */
export function shapeLabel(dimensions?: { width: number; height: number }): string | undefined {
    const variant = variantTypeFor(dimensions?.width, dimensions?.height);
    return variant && VARIANT_LABELS[variant];
}

/** Filename tag per variant — written by the publish rename, read back by stackKey */
export const VARIANT_FILE_TAGS: Record<VariantType, string> = {
    FULLSCREEN_VERTICAL: '9x16',
    VERTICAL: '4x5',
    SQUARE: '1x1',
    HORIZONTAL: 'wide',
};

// Tokens that mark a file as one orientation of a creative: pixel sizes
// (1080x1920), known ratios (9x16, 9-16, 1:1, 1.91x1 — a fixed list, so clock
// times like 10:30 survive), and shape/placement words.
const RATIO = ['1_1', '9_16', '16_9', '4_5', '5_4', '2_3', '3_2', '3_4', '4_3', '1\\.91?_1']
    .map(r => r.replace('_', '[x×:-]'))
    .join('|');
const VARIANT_TOKEN = new RegExp(
    '(^|[\\s_.-])(' +
    '\\d{3,4}\\s*[x×]\\s*\\d{3,4}|' + RATIO +
    '|square|sq|vertical|vert|portrait|landscape|horizontal|wide|story|stories|reels?|feed' +
    ')(?=$|[\\s_.-])',
    'gi'
);

/**
 * The part of a filename shared by all orientations of one creative:
 * "Toast_9x16.jpg" and "toast-1x1.png" → "toast". Also matches the publish
 * rename pattern ("AdName_2_1x1" → "adname_2"), so stacks survive reuse of
 * already-published files.
 */
export function stackKey(fileName: string): string {
    // Only real media extensions — builder names already have theirs removed,
    // and "Hat.v2" must keep its ".v2"
    const base = fileName.replace(/\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|mp4|mov|m4v|avi|webm|mkv)$/i, '').toLowerCase();
    const stripped = base
        .replace(VARIANT_TOKEN, '$1')
        .replace(VARIANT_TOKEN, '$1') // adjacent tokens share a separator
        .replace(/[\s_.-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return stripped || base;
}

// Version words designers use for the shapes of one creative: V1, v02, ver3,
// version 2, rev1, copy, final. Deliberately NOT "(1)" (Canva's "Untitled
// design (1)", "(2)"… are usually different creatives) or alt/draft.
const VERSION_TOKEN = new RegExp(
    '(^|_)(' +
    'v\\d{1,3}|ver_?\\d{1,3}|version_?\\d{1,3}|rev_?\\d{1,3}|copy|final' +
    ')(?=$|_)',
    'g'
);

// Names ending in a bare number ("AdName_2", "Toast_V1_3") are numbered
// files — usually this app's publish rename — not shapes of one creative
const NUMBERED_FILE = /_\d{1,3}$/;

/**
 * A looser key that also ignores version words: "HatLady_V1" and
 * "HatLady-v2-final" → "hatlady". Only used to pair images the exact
 * stackKey left on their own; undefined for numbered files (never loosely
 * paired, so renamed ads differing only by V1/V2 don't merge).
 */
export function looseStackKey(fileName: string): string | undefined {
    const exact = stackKey(fileName);
    const stripped = exact
        .replace(VERSION_TOKEN, '$1')
        .replace(VERSION_TOKEN, '$1')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (NUMBERED_FILE.test(stripped)) return undefined;
    return stripped || exact;
}

export interface StackableAsset {
    type: 'image' | 'video';
    name: string;
    dimensions?: { width: number; height: number };
}

export interface MediaStack {
    /** Indices into the input array, in row order */
    members: number[];
    /** Variant per member (undefined for videos / unknown sizes) */
    variants: (VariantType | undefined)[];
}

/**
 * Auto-stack a row's assets into orientation variants of one creative:
 *  1. Exact: images whose names match apart from an orientation tag
 *     ("Toast_9x16" + "Toast_1x1").
 *  2. Loose: images still alone pair up when their names match apart from
 *     version words too ("HatLady_V1" square + "HatLady_V2" vertical).
 *     Never adds to a stack the exact pass already formed.
 * A stack holds at most one image per variant type. Videos, images without
 * size info, and unmatched images stand alone. Stacks are ordered by their
 * first member's position in the row.
 */
export function buildStacks(assets: StackableAsset[]): MediaStack[] {
    type Draft = MediaStack & { key?: string; loose?: string; looseOnly: boolean };
    const exact: Draft[] = [];
    assets.forEach((asset, index) => {
        const variant = asset.type === 'image'
            ? variantTypeFor(asset.dimensions?.width, asset.dimensions?.height)
            : undefined;
        if (asset.type === 'image' && variant) {
            const key = stackKey(asset.name);
            const existing = exact.find(s => s.key === key && !s.variants.includes(variant));
            if (existing) {
                existing.members.push(index);
                existing.variants.push(variant);
                return;
            }
            exact.push({ key, loose: looseStackKey(asset.name), members: [index], variants: [variant], looseOnly: false });
            return;
        }
        exact.push({ members: [index], variants: [variant], looseOnly: false });
    });

    const stacks: Draft[] = [];
    for (const stack of exact) {
        const variant = stack.variants[0];
        const isLoneImage = stack.members.length === 1 && stack.loose !== undefined && variant !== undefined;
        if (isLoneImage) {
            const target = stacks.find(s =>
                (s.looseOnly || s.members.length === 1) && s.loose === stack.loose && !s.variants.includes(variant));
            if (target) {
                target.members.push(stack.members[0]);
                target.variants.push(variant);
                target.looseOnly = true;
                continue;
            }
        }
        stacks.push(stack);
    }
    return stacks.map(({ members, variants }) => ({ members, variants }));
}

export interface MultiMediaItem {
    type: 'image' | 'video';
    /** File name, for error messages and warnings */
    name?: string;
    hash?: string;
    videoId?: string;
    width?: number;
    height?: number;
    /** Stack index from buildStacks — items sharing it become one group */
    stack?: number;
    /** Video thumbnail — resolved server-side after the video finishes processing */
    thumbnailUrl?: string | null;
}

/** Identity Meta dedupes on — and what the read-back is compared by */
export const mediaKey = (item: Pick<MultiMediaItem, 'type' | 'hash' | 'videoId'>) =>
    item.type === 'image' ? `i:${item.hash}` : `v:${item.videoId}`;

/** "Toast_9x16" (or "media 3" without a name), for user-facing messages */
export const mediaLabel = (item: MultiMediaItem, index: number) =>
    item.name ? `"${item.name}"` : `media ${index + 1}`;

/**
 * Validates untrusted input (the request body) into publishable items: drops
 * malformed entries, de-duplicates (Meta rejects duplicate hashes/video ids —
 * two Drive files with identical bytes produce the same hash), THEN caps at 10
 * so a duplicate never pushes out a real item.
 */
export function normalizeMediaItems(input: unknown): {
    items: MultiMediaItem[];
    droppedDuplicates: number;
    droppedInvalid: number;
} {
    const list: unknown[] = Array.isArray(input) ? input : [];
    const valid = list.filter((m): m is MultiMediaItem => {
        if (!m || typeof m !== 'object') return false;
        const item = m as Partial<MultiMediaItem>;
        return (item.type === 'image' && typeof item.hash === 'string' && item.hash.length > 0)
            || (item.type === 'video' && typeof item.videoId === 'string' && item.videoId.length > 0);
    });
    const seen = new Set<string>();
    const unique = valid.filter(item => {
        const key = mediaKey(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    return {
        items: unique.slice(0, MULTI_MEDIA_MAX_ASSETS),
        droppedDuplicates: valid.length - unique.length,
        droppedInvalid: list.length - valid.length,
    };
}

export interface BuildMultiMediaOptions {
    items: MultiMediaItem[];
    primaryTexts: string[];
    headlines: string[];
}

export interface BuiltMediaSourcingSpec {
    spec: Record<string, unknown>;
    /** Deduped, capped items in publish order — items[0] is the primary media */
    items: MultiMediaItem[];
    /** Number of image groups written */
    groupCount: number;
    droppedDuplicates: number;
}

/**
 * Contract (Meta docs + live probe): max 10 media; no duplicate hashes /
 * video ids; the primary media in object_story_spec must ALSO be listed here;
 * every entry has source "multi_media" + opt_in_status "opt_in"; videos also
 * need original_video_id, thumbnail_url, thumbnail_source; root titles/bodies
 * are the global text variations.
 */
export function buildMediaSourcingSpec({
    items,
    primaryTexts,
    headlines,
}: BuildMultiMediaOptions): BuiltMediaSourcingSpec {
    const { items: capped, droppedDuplicates } = normalizeMediaItems(items);

    // One client-generated UUID per stack (Ads Manager uses UUIDs too); an
    // image without a stack index is its own group
    const groupIds = new Map<string, string>();
    const groupIdFor = (item: MultiMediaItem, index: number) => {
        const key = item.stack !== undefined ? `s:${item.stack}` : `i:${index}`;
        if (!groupIds.has(key)) groupIds.set(key, globalThis.crypto.randomUUID());
        return groupIds.get(key)!;
    };

    const images: Record<string, unknown>[] = [];
    const videos: Record<string, unknown>[] = [];
    capped.forEach((item, index) => {
        if (item.type === 'image') {
            const variant = variantTypeFor(item.width, item.height);
            images.push({
                hash: item.hash,
                source: 'multi_media',
                opt_in_status: 'opt_in',
                group_id: groupIdFor(item, index),
                ...(variant && { variant_types: [variant] }),
            });
        } else {
            videos.push({
                video_id: item.videoId,
                original_video_id: item.videoId,
                source: 'multi_media',
                opt_in_status: 'opt_in',
                thumbnail_source: 'generated_default',
                ...(item.thumbnailUrl && { thumbnail_url: item.thumbnailUrl }),
            });
        }
    });

    // Keep each stack's images adjacent, as Ads Manager writes them (stable:
    // stacks in first-appearance order, so the primary's stack stays first)
    const groupOrder = new Map<unknown, number>();
    images.forEach(img => { if (!groupOrder.has(img.group_id)) groupOrder.set(img.group_id, groupOrder.size); });
    images.sort((a, b) => groupOrder.get(a.group_id)! - groupOrder.get(b.group_id)!);

    const spec: Record<string, unknown> = {
        ...(images.length > 0 && { images }),
        ...(videos.length > 0 && { videos }),
        bodies: primaryTexts.slice(0, 5).map(text => ({ text })),
        titles: headlines.slice(0, 5).map(text => ({ text })),
    };

    return {
        spec,
        items: capped,
        groupCount: groupIds.size,
        droppedDuplicates,
    };
}
