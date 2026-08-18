// Core types for the Campaign Orchestrator

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

// Meta's recommended character limits
export const META_CHAR_LIMITS = {
    headline: 40,
    primaryText: 125,  // For optimal display
    primaryTextMax: 500,
} as const;

// Ad Type options - defines the format of the ad
export const AD_TYPES = STANDARDIZED_AD_TYPES.map(t => ({
    id: t.id,
    label: t.displayName,
    description: t.description
}));

export type AdType = AdTypeId;

// Configurable ad type with naming alias
export interface AdTypeConfig {
    id: string;           // Internal identifier (e.g., 'flexible')
    displayName: string;  // Shown in UI dropdown (e.g., 'Flexible')
    namingAlias: string;  // Used in generated ad names (e.g., 'Flex')
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
    assets: Asset[];  // Supports Flexible Ads with multiple assets
    slots: AdRowSlots;
    adType?: AdType;  // Ad format type (flexible, single_image, single_video, carousel)
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
    productId: string | null;       // Selected product from global catalog
    targetAudience: string;         // Campaign-specific audience description
    keyMessages: string;            // Campaign brief/context for AI
    driveFolderUrl: string | null;  // Google Drive asset folder URL
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

// Prompt Modifier - creative nudges for AI generation
export interface PromptModifier {
    id: string;
    label: string;
    emoji: string;
    promptInjection: string;  // The actual text injected into the prompt
    isBuiltIn: boolean;       // true = system default, false = user-created
}

// Built-in modifiers (static defaults for new users)
export const DEFAULT_MODIFIERS: PromptModifier[] = [
    {
        id: 'urgency',
        label: 'Urgency',
        emoji: '🔥',
        promptInjection: 'Add time-sensitive or scarcity language to create urgency.',
        isBuiltIn: true,
    },
    {
        id: 'emotional',
        label: 'Emotional',
        emoji: '💭',
        promptInjection: 'Lean into emotional storytelling and personal connection.',
        isBuiltIn: true,
    },
    {
        id: 'list-format',
        label: 'List Format',
        emoji: '📝',
        promptInjection: 'Structure the copy as a list using bullet points (•), numbered items, or arrows (→). You may use multiple lines for the list items — just keep the [P] prefix on the first line only.',
        isBuiltIn: true,
    },
    {
        id: 'question-hook',
        label: 'Question Hook',
        emoji: '❓',
        promptInjection: 'Open with a compelling question that hooks the reader.',
        isBuiltIn: true,
    },
    {
        id: 'benefit-first',
        label: 'Benefit-First',
        emoji: '🎯',
        promptInjection: 'Lead immediately with the core customer benefit.',
        isBuiltIn: true,
    },
    {
        id: 'conversational',
        label: 'Conversational',
        emoji: '🗣️',
        promptInjection: 'Write in a casual, friend-to-friend conversational tone.',
        isBuiltIn: true,
    },
    {
        id: 'wildcard',
        label: 'Wildcard',
        emoji: '🎲',
        promptInjection: 'Surprise me with an unexpected, creative angle I haven\'t considered.',
        isBuiltIn: true,
    },
    {
        id: 'social-proof',
        label: 'Social Proof',
        emoji: '⭐',
        promptInjection: 'Reference reviews, testimonials, or community validation.',
        isBuiltIn: true,
    },
    {
        id: 'problem-agitate',
        label: 'Problem-Agitate',
        emoji: '😤',
        promptInjection: 'Lead with the pain point and make the reader feel it before presenting the solution.',
        isBuiltIn: true,
    },
];

// Keep BUILT_IN_MODIFIERS as alias for backwards compatibility
export const BUILT_IN_MODIFIERS = DEFAULT_MODIFIERS;

// Product with USPs for prompt injection
export interface Product {
    id: string;
    name: string;
    emoji: string;                    // Visual identifier
    usps: string;                     // Key selling points (plain text, ~500 chars)
    createdAt: Date;
}

// Customer Persona for targeting
export interface CustomerPersona {
    id: string;
    name: string;                     // e.g., "Weekend Adventurer"
    emoji: string;                    // Visual identifier (e.g., "🏕️")
    description: string;              // Detailed description (~800 chars)
    createdAt: Date;
}

// Iteration Action - refinement operations for existing copy
export interface IterationAction {
    id: string;
    label: string;
    emoji: string;
    promptInjection: string;          // The actual refinement instruction
}

// Default iteration actions (for new users)
export const DEFAULT_ITERATION_ACTIONS: IterationAction[] = [
    {
        id: 'shorter',
        label: 'Shorter',
        emoji: '✂️',
        promptInjection: 'Make this more concise. Remove filler words. Keep the punch.',
    },
    {
        id: 'punchier',
        label: 'Punchier',
        emoji: '💥',
        promptInjection: 'Make the opening hit harder. Stronger verb. Immediate hook.',
    },
    {
        id: 'different-angle',
        label: 'Different Angle',
        emoji: '🔄',
        promptInjection: 'Same benefit, completely different approach. Surprise me.',
    },
    {
        id: 'softer-sell',
        label: 'Softer Sell',
        emoji: '🤝',
        promptInjection: 'Less salesy, more conversational. Like a friend recommending.',
    },
    {
        id: 'more-specific',
        label: 'More Specific',
        emoji: '🎯',
        promptInjection: 'Add concrete details, numbers, or sensory language. Ground it.',
    },
];

// Demo products removed - products now come from user settings in Firestore

// ============================================
// AI Provider & Model Configuration
// ============================================

export type AIProvider = 'google' | 'anthropic' | 'openai';

export interface AIModelOption {
    id: string;
    provider: AIProvider;
    displayName: string;
    description: string;
    // false => this model rejects the `temperature` sampling param (e.g. Claude
    // Sonnet 5 / Opus 4.8 return 400); the AI route omits temperature for it.
    // Undefined/true => temperature is sent normally.
    supportsTemperature?: boolean;
}

export const AVAILABLE_AI_MODELS: AIModelOption[] = [
    // Google Gemini — GA ids (the 3.x *-preview ids were shut down mid-2026).
    // All Gemini models accept `temperature`.
    { id: 'gemini-2.5-flash', provider: 'google', displayName: 'Gemini 2.5 Flash', description: 'Best price-performance (GA)' },
    { id: 'gemini-3.5-flash', provider: 'google', displayName: 'Gemini 3.5 Flash', description: 'Most intelligent Flash (GA)' },
    { id: 'gemini-3.1-flash-lite', provider: 'google', displayName: 'Gemini 3.1 Flash-Lite', description: 'Fastest, lowest cost (GA)' },
    { id: 'gemini-2.5-pro', provider: 'google', displayName: 'Gemini 2.5 Pro', description: 'Premium quality (GA)' },
    // Anthropic Claude. supportsTemperature:false => the AI route omits the
    // `temperature` param for that model (Sonnet 5 / Opus 4.8 reject it with a
    // 400; Sonnet 4.6 and Haiku 4.5 accept it). Model ids verified current.
    { id: 'claude-opus-4-8', provider: 'anthropic', displayName: 'Claude Opus 4.8', description: 'Most capable', supportsTemperature: false },
    { id: 'claude-sonnet-5', provider: 'anthropic', displayName: 'Claude Sonnet 5', description: 'Near-Opus quality, faster', supportsTemperature: false },
    { id: 'claude-sonnet-4-6', provider: 'anthropic', displayName: 'Claude Sonnet 4.6', description: 'High quality, balanced' },
    { id: 'claude-haiku-4-5', provider: 'anthropic', displayName: 'Claude Haiku 4.5', description: 'Fast and affordable' },
    // OpenAI. GPT-5 reasoning models (gpt-5.5) reject `temperature`
    // (supportsTemperature:false); gpt-5-chat-latest is non-reasoning and accepts it.
    { id: 'gpt-5-chat-latest', provider: 'openai', displayName: 'GPT-5 Chat', description: 'Fast, non-reasoning — ideal for copy' },
    { id: 'gpt-5.5', provider: 'openai', displayName: 'GPT-5.5', description: 'Flagship reasoning', supportsTemperature: false },
    { id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini', description: 'Affordable' },
];

/**
 * Whether a model accepts the `temperature` sampling parameter. Some models
 * (Claude Sonnet 5 / Opus 4.8, and typically OpenAI reasoning models) reject it
 * with a 400; the AI route omits temperature for those. Unknown ids default to
 * supported.
 */
export function modelSupportsTemperature(modelId: string | undefined): boolean {
    if (!modelId) return true;
    return AVAILABLE_AI_MODELS.find(m => m.id === modelId)?.supportsTemperature !== false;
}

export const AI_PROVIDER_INFO: Record<AIProvider, { label: string; emoji: string }> = {
    google: { label: 'Google Gemini', emoji: '✦' },
    anthropic: { label: 'Anthropic Claude', emoji: '🟠' },
    openai: { label: 'OpenAI', emoji: '◆' },
};

// ============================================
// Global Prompt Settings (shared across all campaigns)
// ============================================

export interface GlobalPromptSettings {
    copywriterPersona: string;           // System prompt (~800 chars)
    brandKnowledge: string;              // Key brand facts (~2000 chars)
    killList: string[];                  // Words/phrases to avoid
    emojiDensity: 'none' | 'sparse' | 'liberal';
    modifiers: PromptModifier[];         // 9 generation modifiers
    iterationActions: IterationAction[]; // 5 iteration actions
    products: Product[];                 // Product catalog
    customerPersonas: CustomerPersona[]; // Customer personas
    defaultTemperature: number;          // Default creativity level (0-1)
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
    // AI Engine configuration (shared across team). NOTE: provider API keys are
    // NOT stored here — they live server-side as env vars only (see docs/SECURITY.md).
    aiProvider?: AIProvider;                       // Active AI provider (google, anthropic, openai)
    aiModel?: string;                              // Active model ID within the provider
}

// Default global settings for initialization
export const DEFAULT_GLOBAL_SETTINGS: GlobalPromptSettings = {
    copywriterPersona: `You are a world-class direct response copywriter with deep expertise in Meta advertising.
Your copy converts browsers into buyers. You understand hooks, emotional triggers, and clear CTAs.
Write in a conversational yet persuasive tone. Each piece should feel authentic, not salesy.`,
    brandKnowledge: '',
    killList: [],
    emojiDensity: 'sparse',
    modifiers: DEFAULT_MODIFIERS,
    iterationActions: DEFAULT_ITERATION_ACTIONS,
    products: [],
    customerPersonas: [],
    defaultTemperature: 0.7,
    adTypes: DEFAULT_AD_TYPES,
    campaignTypes: DEFAULT_CAMPAIGN_TYPES,
    urlParameters: '',
    defaultAgeMin: 21,
    aiProvider: 'google',
    aiModel: 'gemini-2.5-flash',
};

// Brain configuration for AI generation session
// Used at runtime to track current generation settings
export interface BrainConfig {
    context: string;              // User's freeform context input
    temperature: number;          // 0-1 scale (0.3 = safe, 0.9 = experimental)
    activeModifiers: string[];    // IDs of currently active modifiers (max 2)
    selectedProductId?: string;   // Optional product to inject USPs from
    selectedPersonaId?: string;   // Optional persona for targeting
}

// Generated item from AI
export interface GeneratedItem {
    id: string;
    text: string;
    type: 'headline' | 'primary_text';
    status: 'pending' | 'accepted' | 'rejected';
    sourceModifiers: string[];    // Which modifiers were active during generation
    createdAt: Date;
}

// Session history for Brain generations
export interface GenerationSession {
    id: string;
    context: string;
    temperature: number;
    modifiers: string[];
    items: GeneratedItem[];
    createdAt: Date;
}

export interface BrandVoice {
    personaInstructions: string;
    negativeConstraints: string[];
    knowledgeBase?: string;
    formattingRules: {
        headlineCharLimit: number;
        emojiDensity: 'low' | 'medium' | 'high';
    };
}

// Drag and Drop types
export interface DragItem {
    id: string;
    type: 'copy_item';
    data: CopyItem;
}

export interface DropResult {
    rowId: string;
    slotType: 'headline' | 'primary_text';
    slotIndex: number;
}

// Undo system types
export interface UndoAction {
    id: string;
    timestamp: Date;
    description: string;
    previousState: Partial<Campaign>;
    nextState: Partial<Campaign>;
}
