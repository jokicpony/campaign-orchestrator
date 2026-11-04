/**
 * Standardized Ad Type Identifiers
 */
export type AdTypeId = 'single_image' | 'single_video' | 'carousel' | 'multi_media';

/**
 * Flexible (`creative_asset_groups_spec`) was retired in Nov 2026: Multi-Media
 * replaced it. Rows saved as Flexible open as Multi-Media (`retireFlexible`).
 */
export const RETIRED_AD_TYPE = 'flexible';

/** Single Image / Single Video publish one asset; a row switched from another type, or saved before Nov 2026, can hold more. */
export function isSingleAdType(adType: string | undefined): boolean {
    return adType === 'single_image' || adType === 'single_video';
}

/** The assets an ad actually publishes: only the first for a single ad. */
export function publishedAssets<T>(adType: string | undefined, assets: T[]): T[] {
    return isSingleAdType(adType) ? assets.slice(0, 1) : assets;
}

/** A row saved with the retired Flexible type opens as Multi-Media; others pass through. */
export function retireFlexible<T extends { adType?: string | null }>(row: T): T {
    return row.adType === RETIRED_AD_TYPE ? { ...row, adType: 'multi_media' } : row;
}

/**
 * Carousel card minimum (Meta requires at least 2 child attachments)
 */
export const CAROUSEL_MIN_CARDS = 2;

/**
 * Carousel card maximum (Meta's child_attachments limit)
 */
export const CAROUSEL_MAX_CARDS = 10;

/**
 * Copy slots per row for all ad types. Carousel rows grow their headline
 * slots beyond this to match card count (Card N pairs Headline N).
 */
export const BASE_COPY_SLOTS = 5;

/**
 * Metadata for fixed ad types (maintaining existing color scheme)
 */
export const STANDARDIZED_AD_TYPES = [
    {
        id: 'single_image' as AdTypeId,
        displayName: 'Single Image',
        namingAlias: 'Image',
        color: 'emerald',
        description: 'One static image',
        maxAssets: 1,
        recommendedUse: 'More shapes? Use Multi-Media.'
    },
    {
        id: 'single_video' as AdTypeId,
        displayName: 'Single Video',
        namingAlias: 'Video',
        color: 'purple',
        description: 'One video creative',
        maxAssets: 1,
        recommendedUse: 'More shapes? Use Multi-Media.'
    },
    {
        id: 'carousel' as AdTypeId,
        displayName: 'Carousel',
        namingAlias: 'Carousel',
        color: 'amber',
        description: '2–10 cards, each pairing an asset with a headline by position',
        maxAssets: CAROUSEL_MAX_CARDS,
        recommendedUse: 'Card N = Asset N + Headline N'
    },
    {
        id: 'multi_media' as AdTypeId,
        displayName: 'Multi-Media',
        namingAlias: 'Multi',
        color: 'cyan',
        description: 'Up to 10 images + videos in one ad; shapes of one creative stack together',
        maxAssets: 10,
        recommendedUse: 'Same-name shapes stack; the first asset leads.'
    }
] as const;
