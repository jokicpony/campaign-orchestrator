/**
 * Standardized Ad Type Identifiers
 */
export type AdTypeId = 'flexible' | 'single_image' | 'single_video' | 'carousel';

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
        id: 'flexible' as AdTypeId,
        displayName: 'Flexible',
        namingAlias: 'Flex',
        color: 'blue',
        description: 'Multiple assets, Meta optimizes delivery',
        maxAssets: 10,
        recommendedUse: 'Diverse assets for Meta optimization'
    },
    {
        id: 'single_image' as AdTypeId,
        displayName: 'Single Image',
        namingAlias: 'Image',
        color: 'emerald',
        description: 'One static image',
        maxAssets: 3,
        recommendedUse: 'Variations: 9:16, 1:1, 1.9:1'
    },
    {
        id: 'single_video' as AdTypeId,
        displayName: 'Single Video',
        namingAlias: 'Video',
        color: 'purple',
        description: 'One video creative',
        maxAssets: 3,
        recommendedUse: 'Variations: 9:16, 1:1, 16:9'
    },
    {
        id: 'carousel' as AdTypeId,
        displayName: 'Carousel',
        namingAlias: 'Carousel',
        color: 'amber',
        description: '2–10 cards, each pairing an asset with a headline by position',
        maxAssets: CAROUSEL_MAX_CARDS,
        recommendedUse: 'Card N = Asset N + Headline N'
    }
] as const;
