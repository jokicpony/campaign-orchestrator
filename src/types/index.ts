// Core types for the Campaign Orchestrator
import type { CopyContextPage } from './copywriter';
export type { CopyCampaignContext, CopyContextPage, CopyRowContext, CopyTurn, CopyWinner } from './copywriter';

export interface CopyItem {
    id: string;
    text: string;
    type: 'headline' | 'primary_text';
    source: 'historical' | 'ai_generated' | 'manual';
    metrics?: {
        roas?: number;
        ctr?: number;
        spend?: number;
    };
    sourceAdNames?: string[];  // Ad names this copy appeared in (for filtering by product)
    createdAt: Date;
}

export interface Asset {
    id: string;
    name: string;
    originalName: string;
    thumbnailUrl: string;
    fullUrl: string;
    type: 'video' | 'image';
    driveFileId?: string;
    cachedThumbnail?: string;  // Base64 data URL, cached at load time
    permanentThumbnailUrl?: string; // Firebase Storage URL — never expires
    dimensions?: {
        width: number;
        height: number;
    };
    duration?: number; // For videos, in seconds
}

// Represents copy placed in a slot, with optional local override
export interface SlotItem {
    masterItem: CopyItem;           // Reference to the original item from palette
    localText?: string;             // Local override text (if customized)
    isCustomized: boolean;          // True if localText differs from masterItem.text
}

export interface AdRowSlots {
    primaryTexts: (SlotItem | null)[];  // 5 slots; carousels publish only [0]
    headlines: (SlotItem | null)[];      // 5 base slots; carousels grow to card count (max 10)
    destinationUrl: string | null;
}

// Meta's character limits
export const META_CHAR_LIMITS = {
    headline: 40,
    primaryText: 125,      // shown before "See more"
    primaryTextMax: 2200,  // the most Meta takes (Instagram's caption limit); long-form stories stay under it
} as const;

export type AdType = AdTypeId;

// Configurable ad type with naming alias
export interface AdTypeConfig {
    id: string;           // Internal identifier (e.g., 'multi_media')
    displayName: string;  // Shown in UI dropdown (e.g., 'Multi-Media')
    namingAlias: string;  // Used in generated ad names (e.g., 'Multi')
    color: string;        // Tailwind color key (e.g., 'blue', 'emerald', 'purple')
    description?: string; // Optional description
    maxAssets: number;    // Maximum assets allowed for this type
    recommendedUse?: string; // Guidance for users (e.g., '9:16, 1:1, 16:9')
}

// Available colors for ad types
export const AD_TYPE_COLORS = [
    { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
    { id: 'emerald', label: 'Emerald', class: 'bg-emerald-500' },
    { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
    { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
    { id: 'amber', label: 'Amber', class: 'bg-amber-500' },
    { id: 'cyan', label: 'Cyan', class: 'bg-cyan-500' },
    { id: 'rose', label: 'Rose', class: 'bg-rose-500' },
    { id: 'indigo', label: 'Indigo', class: 'bg-indigo-500' },
] as const;

export const DEFAULT_AD_TYPES: AdTypeConfig[] = [...STANDARDIZED_AD_TYPES];

// Merge stored ad-type overrides onto the built-in list. Saved configs may
// predate newer built-in types (e.g. Carousel), so the defaults are the base
// and maxAssets/recommendedUse stay architectural (never user-overridable).
export function mergeAdTypes(storedTypes?: AdTypeConfig[]): AdTypeConfig[] {
    const stored = storedTypes || [];
    return DEFAULT_AD_TYPES.map(baseType => {
        const userType = stored.find(t => t.id === baseType.id);
        return userType
            ? { ...baseType, ...userType, maxAssets: baseType.maxAssets, recommendedUse: baseType.recommendedUse }
            : baseType;
    });
}

// Carousel rows grow headline slots with their cards (Card N = Headline N),
// up to Meta's 10-card limit; every other type keeps the base 5. Trailing
// empty slots beyond the target are dropped, but filled ones are kept so
// switching types never silently deletes copy.
export function normalizeHeadlineSlots(
    headlines: (SlotItem | null)[],
    adType: AdType | null | undefined,
    assetCount: number
): (SlotItem | null)[] {
    const target = adType === 'carousel'
        ? Math.max(BASE_COPY_SLOTS, Math.min(assetCount, CAROUSEL_MAX_CARDS))
        : BASE_COPY_SLOTS;
    const next = [...headlines];
    while (next.length < target) next.push(null);
    while (next.length > target && next[next.length - 1] === null) next.pop();
    return next;
}

// Call-to-Action options for Meta Ads
export const CTA_OPTIONS = [
    { id: 'LEARN_MORE', label: 'Learn More' },
    { id: 'SHOP_NOW', label: 'Shop Now' },
    { id: 'BUY_NOW', label: 'Buy Now' },
    { id: 'SIGN_UP', label: 'Sign Up' },
    { id: 'SUBSCRIBE', label: 'Subscribe' },
    { id: 'GET_OFFER', label: 'Get Offer' },
    { id: 'CONTACT_US', label: 'Contact Us' },
    { id: 'DOWNLOAD', label: 'Download' },
    { id: 'BOOK_NOW', label: 'Book Now' },
    { id: 'GET_QUOTE', label: 'Get Quote' },
] as const;

export type CallToAction = typeof CTA_OPTIONS[number]['id'];


// ========== Naming Convention System ==========

// Token type determines how the value is selected
export type NamingTokenType = 'dropdown' | 'text' | 'auto';

// Token definition for naming templates
export interface NamingToken {
    id: string;
    label: string;           // Display name (e.g., "Product")
    key: string;             // Token key (e.g., "product")
    type: NamingTokenType;   // dropdown=predefined options, text=freeform, auto=from row data
    options?: string[];      // For dropdown type - predefined choices
    autoSource?: 'angleName' | 'adType' | 'date' | 'campaignType';  // For auto type - data source
    required: boolean;
}

// Template defining the naming pattern
export interface NamingConventionTemplate {
    id: string;
    name: string;            // Template name (e.g., "Standard Campaign")
    tokens: NamingToken[];   // Ordered tokens that make up the name
    separator: string;       // Character between tokens (_, -, etc.)
    isDefault?: boolean;     // If true, auto-applied to new rows
}

// Values selected for a specific ad row based on a template
export interface AdNamingValues {
    templateId: string;                   // Which template is being used
    values: Record<string, string>;       // Token key -> selected/entered value
}

// Default naming template for initialization
export const DEFAULT_NAMING_TEMPLATE: NamingConventionTemplate = {
    id: 'standard',
    name: 'Standard',
    separator: '_',
    isDefault: true,
    tokens: [
        { id: '1', label: 'Product', key: 'product', type: 'dropdown', options: [], required: true },
        { id: '2', label: 'Angle', key: 'angle', type: 'auto', autoSource: 'angleName', required: true },
        { id: '3', label: 'Creative Type', key: 'creativeType', type: 'auto', autoSource: 'adType', required: true },
    ],
};

// ========== Campaign Naming Convention System ==========

// Configurable campaign type with naming alias (mirrors AdTypeConfig pattern)
export interface CampaignTypeConfig {
    id: string;            // Internal identifier (e.g., 'STANDARD')
    displayName: string;   // Shown in UI (e.g., 'Standard')
    namingAlias: string;   // Used in generated names (e.g., 'STD')
}

// Default campaign types with initial aliases
export const DEFAULT_CAMPAIGN_TYPES: CampaignTypeConfig[] = [
    { id: 'STANDARD', displayName: 'Standard', namingAlias: 'STD' },
    { id: 'ASC', displayName: 'Advantage+ Shopping', namingAlias: 'ASC' },
];

// Default campaign naming template for initialization
export const DEFAULT_CAMPAIGN_NAMING_TEMPLATE: NamingConventionTemplate = {
    id: 'campaign-standard',
    name: 'Standard',
    separator: '_',
    isDefault: true,
    tokens: [
        { id: 'c1', label: 'Product', key: 'product', type: 'dropdown', options: [], required: true },
        { id: 'c2', label: 'Date', key: 'date', type: 'auto', autoSource: 'date', required: true },
        { id: 'c3', label: 'Campaign Type', key: 'campaignType', type: 'auto', autoSource: 'campaignType', required: false },
    ],
};

// Comment entry for ad feedback thread
import { AdTypeId, STANDARDIZED_AD_TYPES, BASE_COPY_SLOTS, CAROUSEL_MAX_CARDS } from './ad-types';

export interface AdComment {
    id: string;
    text: string;
    author: 'builder' | 'reviewer';
    authorName: string;  // Display name of who left the comment
    createdAt: Date;
}

export interface AdRow {
    id: string;
    angleName?: string;  // Name/label for this ad angle (e.g., "Holiday Sale", "Social Proof")
    assets: Asset[];  // In order; the first asset leads
    slots: AdRowSlots;
    adType?: AdType;  // multi_media, carousel, single_image or single_video
    callToAction?: CallToAction;  // CTA for Meta ads (LEARN_MORE, SHOP_NOW, etc.)
    // Review workflow fields
    reviewStatus?: 'pending' | 'reviewed' | 'needs_changes';
    approvedAt?: string;              // ISO date string of when ad was approved/reviewed
    comments?: AdComment[];  // Bi-directional comment thread
    // Naming convention fields
    namingValues?: AdNamingValues;  // Token values for generating ad name
    generatedAdName?: string;       // Assembled name from template (for Meta API)
    // Publishing status
    lastPublishedAt?: string;       // ISO date string of last successful publish
    metaAdId?: string;              // ID of the ad on Meta platform
    createdAt: Date;
    updatedAt: Date;
}

// Campaign brief - lightweight, campaign-specific context
export interface CampaignBrief {
    keyMessages: string;              // Context card notes: anything the copywriter should know
    driveFolderUrl: string | null;    // Google Drive asset folder URL
    contextLinks?: string[];          // Context card links (up to 5) the copywriter reads
    contextPages?: CopyContextPage[]; // Text read from contextLinks and row URLs (shared by every row)
    // Legacy (pre-Oct 2026 Co-Writer): still in old campaign docs, no longer written
    productId?: string | null;
    targetAudience?: string;
}

export interface Campaign {
    id: string;
    name: string;
    status: 'draft' | 'review' | 'published';
    archiveStatus?: 'active' | 'archived';  // For archiving, default: 'active'
    archivedAt?: string;                     // ISO timestamp when archived
    position?: number;                // For tab ordering
    lockedBy?: string;
    lockedAt?: Date;
    rows: AdRow[];
    palette: {
        historical: CopyItem[];
        active: CopyItem[];
    };
    brief: CampaignBrief;           // Campaign-specific context
    createdAt: Date;
    updatedAt: Date;
}

// ============================================
// Global Prompt Settings (shared across all campaigns)
// ============================================

export interface GlobalPromptSettings {
    // Copywriter (team-wide; each campaign adds its own links and notes)
    brandVoice: string;                  // Tone, house rules, emoji habits, brand facts — plain words
    targetPersonas: string;              // Who we sell to — plain words
    killList: string[];                  // Words/phrases the copywriter must never use (enforced on output)
    // Ad naming convention system
    namingTemplates?: NamingConventionTemplate[];  // Available ad naming templates
    defaultNamingTemplateId?: string;              // Template auto-applied to new rows
    // Campaign naming convention system
    campaignNamingTemplates?: NamingConventionTemplate[];  // Available campaign naming templates
    defaultCampaignNamingTemplateId?: string;              // Default campaign naming template
    campaignTypes?: CampaignTypeConfig[];                  // Campaign type aliases for naming
    // Ad types configuration
    adTypes?: AdTypeConfig[];                      // Configurable ad types with naming aliases
    // URL parameters for tracking
    urlParameters?: string;                        // UTM params appended to all destination URLs
    // Default Meta ad account (auto-selected on new connections)
    defaultAdAccountId?: string;                   // Organization-wide default ad account ID
    // Default minimum audience age applied to every published ad set. Omitted
    // for Special Ad Categories (which forbid age targeting). Regulated
    // verticals (e.g. alcohol) set 21; general-purpose deployments use 18.
    defaultAgeMin?: number;
}

// Default global settings for initialization
export const DEFAULT_GLOBAL_SETTINGS: GlobalPromptSettings = {
    brandVoice: '',
    targetPersonas: '',
    killList: [],
    adTypes: DEFAULT_AD_TYPES,
    campaignTypes: DEFAULT_CAMPAIGN_TYPES,
    urlParameters: '',
    defaultAgeMin: 18,
};
