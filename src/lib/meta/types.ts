// Meta Marketing API Types

/**
 * Meta OAuth token data stored per-user
 */
export interface MetaConnection {
    // The access token is NOT here — it lives server-side only (serverSecrets),
    // keyed by uid. The client only ever holds non-secret connection metadata.
    tokenExpiresAt: Date;          // Expiration timestamp (for reconnect UX)
    userId: string;                // Meta user ID
    userName: string;              // Meta user name
    adAccounts: MetaAdAccount[];   // User's accessible ad accounts
    selectedAdAccountId: string | null;  // Currently active account
    pages: MetaPage[];             // User's Facebook Pages
    selectedPageId: string | null; // Selected page for publishing
    connectedAt: Date;
}

/**
 * Facebook Page for ad publishing
 */
export interface MetaPage {
    id: string;                    // Page ID
    name: string;                  // Page name
    instagramAccountId?: string;   // Linked Instagram Business Account ID
}

/**
 * Ad Account from Meta Business
 */
export interface MetaAdAccount {
    id: string;                    // Format: act_XXXXXXXXX
    name: string;
    accountId: string;             // Numeric ID without act_ prefix
    businessName?: string;
    currency: string;
    timezoneId: number;
    timezoneName: string;
}

/**
 * Campaign from Meta Ads API
 */
export interface MetaCampaign {
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    objective: string;
    dailyBudget?: number;
    lifetimeBudget?: number;
}

/**
 * Ad Set from Meta Ads API
 */
export interface MetaAdSet {
    id: string;
    name: string;
    campaignId: string;
    status: 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';
    dailyBudget?: number;
    lifetimeBudget?: number;
    optimizationGoal?: string;
    billingEvent?: string;
}

/**
 * Ad Insight data from Insights API
 */
export interface MetaAdInsight {
    adId: string;
    adName: string;
    campaignId: string;
    campaignName: string;
    adsetId: string;
    adsetName: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    reach: number;
    // Conversion metrics (may not always be present)
    purchases?: number;
    purchaseValue?: number;
    roas?: number;
}

/**
 * Ad Creative from Marketing API
 */
export interface MetaAdCreative {
    id: string;
    name?: string;
    body?: string;                 // Primary text
    title?: string;                // Headline
    callToActionType?: string;
    linkUrl?: string;
    imageUrl?: string;
    videoId?: string;
    thumbnailUrl?: string;
}

/**
 * Combined ad data with insights and creative
 */
export interface MetaTopPerformer {
    adId: string;
    adName: string;
    campaignName: string;
    // Creative content
    primaryText: string | null;
    headline: string | null;
    callToAction: string | null;
    destinationUrl: string | null;
    // Performance metrics
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    // Optional conversion data
    roas?: number;
}

/**
 * Options for fetching top performers
 */
export interface TopPerformersOptions {
    adAccountId: string;
    datePreset?: MetaDatePreset;
    startDate?: string;            // YYYY-MM-DD format
    endDate?: string;              // YYYY-MM-DD format
    limit?: number;
    sortBy?: 'spend' | 'impressions' | 'clicks' | 'ctr';
}

/**
 * Meta date presets for Insights API
 */
export type MetaDatePreset =
    | 'today'
    | 'yesterday'
    | 'this_month'
    | 'last_month'
    | 'this_quarter'
    | 'lifetime'
    | 'last_3d'
    | 'last_7d'
    | 'last_14d'
    | 'last_28d'
    | 'last_30d'
    | 'last_90d'
    | 'last_week_mon_sun'
    | 'last_week_sun_sat'
    | 'last_quarter'
    | 'last_year'
    | 'this_week_mon_today'
    | 'this_week_sun_today'
    | 'this_year';

/**
 * API error response from Meta
 */
export interface MetaApiError {
    error: {
        message: string;
        type: string;
        code: number;
        error_subcode?: number;
        fbtrace_id: string;
    };
}

/**
 * OAuth token exchange response
 */
export interface MetaTokenResponse {
    access_token: string;
    token_type: string;
    expires_in?: number;           // Seconds until expiration
}

/**
 * Debug token response from Meta
 */
export interface MetaTokenDebugInfo {
    data: {
        app_id: string;
        type: string;
        application: string;
        data_access_expires_at: number;
        expires_at: number;
        is_valid: boolean;
        scopes: string[];
        user_id: string;
    };
}
