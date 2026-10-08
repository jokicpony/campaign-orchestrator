'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { authedFetch } from '@/lib/api/authedFetch';
import { startMetaOAuth } from '@/lib/meta/startMetaOAuth';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle, StopCircle } from 'lucide-react';
import { AdRow, CallToAction } from '@/types';
import { CAROUSEL_MIN_CARDS } from '@/types/ad-types';
import { buildStacks, VARIANT_FILE_TAGS } from '@/lib/meta/multiMedia';
import { CampaignTargetStep } from './CampaignTargetStep';
import { CampaignConfigStep } from './CampaignConfigStep';
import { CreativeConfirmStep } from './CreativeConfirmStep';
import { ReviewPublishStep } from './ReviewPublishStep';
import { ConnectionStatus } from './ConnectionStatus';
import { useMetaConnection, useGlobalSettings } from '@/hooks';
import { useAuth } from '@/components/AuthContext';

// How many ads to publish concurrently. Each ad's pipeline (Drive→Meta asset
// transfers + ad creation, which may poll video processing for up to ~60s) runs
// independently, so concurrency overlaps those waits. Kept deliberately low to
// stay well within Meta/Drive rate limits — safe to raise once proven in prod.
const PUBLISH_CONCURRENCY = 3;

/**
 * Run `worker` over `items` with at most `limit` in flight at once. Results are
 * written back by index (order preserved); an item skipped because `shouldStop`
 * fired is left `undefined`. In-flight work always finishes — stopping only
 * prevents NEW items from starting, matching the wizard's "finish current,
 * skip the rest" semantics.
 */
async function runPool<T, R>(
    items: T[],
    limit: number,
    worker: (item: T, index: number) => Promise<R>,
    shouldStop?: () => boolean,
): Promise<(R | undefined)[]> {
    const results: (R | undefined)[] = new Array(items.length);
    let next = 0;
    const runWorker = async () => {
        while (next < items.length) {
            if (shouldStop?.()) return;
            const i = next++; // synchronous between awaits — no race on `next`
            results[i] = await worker(items[i], i);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, runWorker)
    );
    return results;
}

// ============================================
// Types for Wizard State
// ============================================

export type CampaignTargetType = 'new' | 'existing';
export type CampaignType = 'ASC' | 'STANDARD';
export type CampaignObjective =
    | 'OUTCOME_AWARENESS'
    | 'OUTCOME_ENGAGEMENT'
    | 'OUTCOME_TRAFFIC'
    | 'OUTCOME_LEADS'
    | 'OUTCOME_SALES'
    | 'OUTCOME_APP_PROMOTION';
export type OptimizationGoal =
    // Awareness
    | 'REACH'
    | 'THRUPLAY'
    | 'AD_RECALL_LIFT'
    // Engagement
    | 'POST_ENGAGEMENT'
    | 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS'
    // Traffic
    | 'LANDING_PAGE_VIEWS'
    | 'LINK_CLICKS'
    // Leads
    | 'LEAD_GENERATION'
    | 'QUALITY_LEAD'
    | 'CONVERSATIONS'
    // Sales
    | 'OFFSITE_CONVERSIONS'
    | 'VALUE';
export type SpecialAdCategory = 'FINANCIAL_PRODUCTS_SERVICES' | 'EMPLOYMENT' | 'HOUSING' | 'ISSUES_ELECTIONS_POLITICS';
export type ConversionEvent = 'PURCHASE' | 'ADD_TO_CART' | 'INITIATE_CHECKOUT' | 'COMPLETE_REGISTRATION' | 'LEAD' | 'OTHER';
export type BudgetLevel = 'campaign' | 'adset';

export interface CreativeEnhancements {
    enhance_cta: boolean;
    adapt_to_placement: boolean;
    product_extensions: boolean;
    video_auto_crop: boolean;
    show_summary: boolean;
    inline_comment: boolean;
    image_brightness_and_contrast: boolean;
    reveal_details_over_time: boolean;
    site_extensions: boolean;
    text_optimizations: boolean;
    image_animation: boolean;
    add_text_overlay: boolean;
    image_templates: boolean;
    image_touchups: boolean;
}

export type AdSetMode = 'existing' | 'new';

export interface WizardSettings {
    // Step 1: Campaign Target
    targetType: CampaignTargetType;
    existingCampaignId?: string;
    existingCampaignName?: string;
    existingCampaignObjective?: string; // Objective of the selected existing campaign
    existingCampaignIsCBO?: boolean;    // Campaign manages budget (CBO) — new ad sets must not set one
    existingCampaignSpecialAdCategories?: string[]; // Campaign's special ad categories — restrict new ad set targeting
    adSetMode?: AdSetMode;              // For existing campaigns: reuse an ad set or create a new one
    newAdSetName?: string;              // Name for the ad set when adSetMode === 'new'
    existingAdSetId?: string;
    existingAdSetName?: string;

    // Step 2: Configuration (for new campaigns)
    campaignName: string;
    campaignType: CampaignType;
    adSetName: string;
    objective: CampaignObjective;
    optimizationGoal: OptimizationGoal;
    dailyBudget: number; // in dollars
    budgetLevel: BudgetLevel; // 'campaign' = CBO, 'adset' = ad set level budget
    specialAdCategories: SpecialAdCategory[];
    pixelId?: string; // Required for OUTCOME_SALES/OFFSITE_CONVERSIONS campaigns
    conversionEvent: ConversionEvent; // What conversion to optimize for (default: PURCHASE)
    useIncrementalAttribution: boolean; // Meta incremental attribution optimization
    enhancements: CreativeEnhancements; // Advantage+ creative enhancement toggles
    scheduledStartDate?: string; // ISO 8601 start date for the ad set (undefined = start when activated)

    // Step 3: Per-ad overrides (indexed by ad row ID)
    adOverrides: Record<string, {
        destinationUrl?: string;
        callToAction?: CallToAction;
    }>;
    // Global defaults for Step 3
    destinationUrl?: string;
    callToAction?: CallToAction;

    // Step 4: Final settings
    initialStatus: 'PAUSED' | 'ACTIVE';
}

export interface AdPublishResult {
    rowId: string;
    adName: string;
    success: boolean;
    metaAdId?: string;
    error?: string;
    errorDetail?: string; // Human-readable explanation of what went wrong
    warning?: string; // Published, but something needs a look (e.g. Meta didn't keep every multi-media item)
}

// Progress tracking for publish flow
export interface PublishProgress {
    currentStep: 'campaign' | 'adSet' | 'assets' | 'ads' | 'complete' | 'stopped';
    campaignStatus: 'pending' | 'in-progress' | 'done' | 'error';
    adSetStatus: 'pending' | 'in-progress' | 'done' | 'error';
    adsTotal: number;
    adsCompleted: number;
    adsInFlight?: number;   // ads currently publishing concurrently
    currentAdName?: string;
}

interface PublishWizardProps {
    isOpen: boolean;
    onClose: () => void;
    selectedAds: AdRow[];
    campaignName: string; // From BuildMode campaign
    driveFolderUrl?: string | null; // Google Drive folder URL for asset link
    onPublish: (settings: WizardSettings, ads: AdRow[]) => Promise<AdPublishResult[]>;
    onPublishComplete?: (results: AdPublishResult[]) => void; // Called after API publish completes
}

const STEPS = [
    { id: 1, label: 'Campaign Target' },
    { id: 2, label: 'Configuration' },
    { id: 3, label: 'Creative Confirm' },
    { id: 4, label: 'Review & Publish' },
];

const ALL_ENHANCEMENTS_ON: CreativeEnhancements = {
    enhance_cta: true,
    adapt_to_placement: true,
    product_extensions: true,
    video_auto_crop: true,
    show_summary: true,
    inline_comment: true,
    image_brightness_and_contrast: true,
    reveal_details_over_time: true,
    site_extensions: true,
    text_optimizations: true,
    image_animation: true,
    add_text_overlay: true,
    image_templates: true,
    image_touchups: true,
};

// Sensible ad-set optimization defaults per campaign objective, used when
// creating a new ad set inside an existing campaign (where the objective is
// fixed by the campaign).
export function deriveAdSetDefaults(objective: string | undefined): {
    optimizationGoal: OptimizationGoal;
    conversionEvent: ConversionEvent;
    needsPixel: boolean;
} {
    switch (objective) {
        case 'OUTCOME_SALES':
            return { optimizationGoal: 'OFFSITE_CONVERSIONS', conversionEvent: 'PURCHASE', needsPixel: true };
        case 'OUTCOME_LEADS':
            return { optimizationGoal: 'OFFSITE_CONVERSIONS', conversionEvent: 'LEAD', needsPixel: true };
        case 'OUTCOME_TRAFFIC':
            return { optimizationGoal: 'LANDING_PAGE_VIEWS', conversionEvent: 'PURCHASE', needsPixel: false };
        case 'OUTCOME_ENGAGEMENT':
            return { optimizationGoal: 'POST_ENGAGEMENT', conversionEvent: 'PURCHASE', needsPixel: false };
        case 'OUTCOME_AWARENESS':
            return { optimizationGoal: 'REACH', conversionEvent: 'PURCHASE', needsPixel: false };
        default:
            return { optimizationGoal: 'LINK_CLICKS', conversionEvent: 'PURCHASE', needsPixel: false };
    }
}

function makeInitialSettings(campaignName: string, adSetName: string): WizardSettings {
    return {
        targetType: 'new',
        campaignName,
        campaignType: 'STANDARD',
        adSetName,
        adSetMode: 'existing',
        objective: 'OUTCOME_SALES',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        dailyBudget: 10,
        budgetLevel: 'campaign',
        specialAdCategories: [],
        conversionEvent: 'PURCHASE',
        useIncrementalAttribution: true,
        enhancements: { ...ALL_ENHANCEMENTS_ON },
        adOverrides: {},
        initialStatus: 'PAUSED',
        scheduledStartDate: undefined,
    };
}

export function PublishWizard({
    isOpen,
    onClose,
    selectedAds,
    campaignName,
    driveFolderUrl,
    onPublishComplete,
}: PublishWizardProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishResults, setPublishResults] = useState<AdPublishResult[] | null>(null);
    const [createdCampaignId, setCreatedCampaignId] = useState<string | null>(null);
    const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
    const abortPublishRef = useRef(false);

    // Pre-publish validation state
    interface ValidationState {
        status: 'idle' | 'validating' | 'passed' | 'failed';
        meta: { valid: boolean | null; error?: string };
        drive: { valid: boolean | null; error?: string };
    }
    const [validation, setValidation] = useState<ValidationState>({
        status: 'idle',
        meta: { valid: null },
        drive: { valid: null },
    });

    // Get Meta connection for API calls
    const { connection: metaConnection } = useMetaConnection();

    // Get Google Drive access token for asset transfers
    const { driveAccessToken, reconnectDrive } = useAuth();

    // Get global settings (includes urlParameters for tracking)
    const { settings: globalSettings } = useGlobalSettings();

    // Generate default ad set name with date
    const defaultAdSetName = useMemo(() => {
        const date = new Date();
        const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        return `${campaignName} - ${monthDay}`;
    }, [campaignName]);

    const [settings, setSettings] = useState<WizardSettings>(
        () => makeInitialSettings(campaignName, defaultAdSetName)
    );

    const updateSettings = useCallback((updates: Partial<WizardSettings>) => {
        setSettings(prev => ({ ...prev, ...updates }));
    }, []);

    const canProceed = useMemo(() => {
        switch (currentStep) {
            case 1:
                if (settings.targetType === 'existing') {
                    if (!settings.existingCampaignId) return false;
                    if (settings.adSetMode === 'new') {
                        const { needsPixel } = deriveAdSetDefaults(settings.existingCampaignObjective);
                        const budgetOk = settings.existingCampaignIsCBO || settings.dailyBudget >= 1;
                        const pixelOk = !needsPixel || !!settings.pixelId;
                        return !!settings.newAdSetName?.trim() && budgetOk && pixelOk;
                    }
                    return !!settings.existingAdSetId;
                }
                return !!settings.campaignName.trim();
            case 2:
                if (settings.targetType === 'new') {
                    return settings.dailyBudget >= 1 && !!settings.adSetName.trim();
                }
                return true;
            case 3:
                return true; // All overrides are optional
            case 4:
                return true;
            default:
                return false;
        }
    }, [currentStep, settings]);

    const handleNext = () => {
        if (currentStep < 4 && canProceed) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(prev => prev - 1);
        }
    };

    // Validate connections before publishing
    const validateConnections = async (): Promise<boolean> => {
        setValidation({
            status: 'validating',
            meta: { valid: null },
            drive: { valid: null },
        });

        let metaValid = false;
        let driveValid = false;
        let metaError: string | undefined;
        let driveError: string | undefined;

        // Validate Meta token with real API call
        if (metaConnection) {
            try {
                const res = await authedFetch('/api/meta/validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const data = await res.json();
                metaValid = data.valid === true;
                if (!metaValid) {
                    metaError = data.reason || 'Token invalid';
                }
            } catch {
                metaError = 'Validation request failed';
            }
        } else {
            metaError = 'Not connected';
        }

        // Validate Drive token (check if token exists and make a lightweight call)
        if (driveAccessToken) {
            try {
                // Test the token by making a lightweight API call
                const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                    headers: { Authorization: `Bearer ${driveAccessToken}` },
                });
                driveValid = res.ok;
                if (!driveValid) {
                    driveError = 'Token expired';
                }
            } catch {
                driveError = 'Validation failed';
            }
        } else {
            driveError = 'Not connected';
        }

        const allValid = metaValid && driveValid;
        setValidation({
            status: allValid ? 'passed' : 'failed',
            meta: { valid: metaValid, error: metaError },
            drive: { valid: driveValid, error: driveError },
        });

        return allValid;
    };

    // Handle Meta reconnect
    const handleMetaReconnect = async () => {
        try {
            await startMetaOAuth();
        } catch (err) {
            console.error('Failed to start Meta reconnect:', err);
        }
    };

    // Handle Drive reconnect
    const handleDriveReconnect = async () => {
        try {
            await reconnectDrive();
            // Re-validate after reconnect
            setTimeout(() => validateConnections(), 500);
        } catch (err) {
            console.error('Drive reconnect failed:', err);
        }
    };
    // Classify publish errors into human-readable explanations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const classifyPublishError = (data: any): string => {
        const msg = (data?.error || data?.details?.message || '').toLowerCase();
        const code = data?.errorCode || data?.details?.code;
        const subcode = data?.details?.error_subcode;

        // Token expired
        if (code === 190 || msg.includes('token') && msg.includes('expir')) {
            return 'Your Meta access token has expired. Close this dialog, reconnect Meta, and try again.';
        }
        // Video failed on Meta — retrying won't help (check before "processing")
        if (msg.includes('failed processing')) {
            return 'Meta could not process this video. Re-upload the file (or export it again) and publish this ad again.';
        }
        // Video not ready / no thumbnail yet
        if (msg.includes('video') && (msg.includes('not ready') || msg.includes('processing') || msg.includes('thumbnail'))) {
            return 'The video is still being processed by Meta. Wait a minute and try publishing this ad again.';
        }
        // Dynamic Creative limit
        if (subcode === 1885553 || msg.includes('dynamic creative')) {
            return 'The target ad set has a Dynamic Creative restriction (1 ad per set). Try publishing to a different ad set or create a new campaign.';
        }
        // Permission errors
        if (code === 10 || code === 200 || msg.includes('permission')) {
            return 'Your Meta account may not have permission for this ad account. Check your permissions in Business Manager.';
        }
        // Invalid parameter
        if (code === 100 && !subcode) {
            return 'One or more fields in the ad were rejected by Meta. This could be an issue with the image, text, URL, or ad format.';
        }
        // Drive transfer failed
        if (msg.includes('transfer') || msg.includes('drive')) {
            return 'The file transfer from Google Drive to Meta failed. Your Drive session may have expired. Try reconnecting Drive and re-publishing.';
        }
        // Generic fallback
        return `Meta returned an error: "${data?.error || 'Unknown error'}". Check the ad\'s content (URL, copy, image) and try again.`;
    };

    const handlePublish = async () => {
        // First, validate connections
        const isValid = await validateConnections();
        if (!isValid) {
            // Validation failed - don't proceed, let user see the validation UI
            return;
        }

        abortPublishRef.current = false;
        setIsPublishing(true);
        const results: AdPublishResult[] = [];

        // Initialize progress tracking
        const createsAdSet = settings.targetType === 'new' ||
            (settings.targetType === 'existing' && settings.adSetMode === 'new');
        setPublishProgress({
            currentStep: settings.targetType === 'new' ? 'campaign' : createsAdSet ? 'adSet' : 'ads',
            campaignStatus: settings.targetType === 'new' ? 'pending' : 'done',
            adSetStatus: createsAdSet ? 'pending' : 'done',
            adsTotal: selectedAds.length,
            adsCompleted: 0,
        });

        try {
            // Validate Meta connection
            if (!metaConnection?.selectedAdAccountId) {
                throw new Error('Meta account not connected');
            }

            if (!metaConnection?.selectedPageId) {
                throw new Error('No Facebook Page selected. Please select a page in Settings > Connections.');
            }

            // Get ad set ID based on target type
            let targetAdSetId: string | null = null;

            if (settings.targetType === 'existing' && settings.adSetMode === 'new') {
                // EXISTING CAMPAIGN + NEW AD SET: create the ad set inside the
                // selected campaign. Objective is fixed by the campaign;
                // optimization defaults derive from it. CBO campaigns manage
                // budget at the campaign level, so the ad set gets none.
                const { optimizationGoal, conversionEvent, needsPixel } =
                    deriveAdSetDefaults(settings.existingCampaignObjective);

                setPublishProgress(prev => prev ? {
                    ...prev,
                    currentStep: 'adSet',
                    campaignStatus: 'done',
                    adSetStatus: 'in-progress',
                } : prev);

                const adSetRes = await authedFetch('/api/meta/adset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        adAccountId: metaConnection.selectedAdAccountId,
                        campaignId: settings.existingCampaignId,
                        name: settings.newAdSetName,
                        dailyBudget: settings.existingCampaignIsCBO ? undefined : settings.dailyBudget,
                        budgetLevel: settings.existingCampaignIsCBO ? 'campaign' : 'adset',
                        optimizationGoal,
                        isASC: false,
                        pixelId: needsPixel ? settings.pixelId : undefined,
                        conversionEvent,
                        useIncrementalAttribution: false,
                        pageId: metaConnection.selectedPageId,
                        objective: settings.existingCampaignObjective,
                        specialAdCategories: settings.existingCampaignSpecialAdCategories || [],
                        ageMin: globalSettings.defaultAgeMin,
                        startTime: settings.scheduledStartDate || undefined,
                    }),
                });

                const adSetData = await adSetRes.json();
                if (!adSetData.success) {
                    console.error('Ad Set creation failed:', JSON.stringify(adSetData, null, 2));
                    throw new Error(adSetData.error || 'Failed to create ad set in existing campaign');
                }

                targetAdSetId = adSetData.adSetId;
                setPublishProgress(prev => prev ? {
                    ...prev,
                    currentStep: 'ads',
                    adSetStatus: 'done',
                } : prev);
            } else if (settings.targetType === 'existing') {
                targetAdSetId = settings.existingAdSetId || null;
            } else {
                // NEW CAMPAIGN FLOW: Create campaign and ad set first
                console.log('Creating new campaign:', settings.campaignName);

                // Update progress: Campaign creation starting
                setPublishProgress(prev => prev ? { ...prev, currentStep: 'campaign', campaignStatus: 'in-progress' } : prev);

                // Step 1: Create Campaign
                const campaignRes = await authedFetch('/api/meta/campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        adAccountId: metaConnection.selectedAdAccountId,
                        name: settings.campaignName,
                        objective: settings.objective,
                        specialAdCategories: settings.specialAdCategories,
                        campaignType: settings.campaignType,
                        budgetLevel: settings.budgetLevel,
                        dailyBudget: settings.budgetLevel === 'campaign' ? settings.dailyBudget : undefined,
                    }),
                });

                const campaignData = await campaignRes.json();
                console.log('Campaign API Response:', campaignRes.status, campaignData);

                if (!campaignData.success) {
                    // Log full error details for debugging
                    console.error('Campaign creation failed:', JSON.stringify(campaignData, null, 2));
                    throw new Error(campaignData.error || 'Failed to create campaign');
                }
                console.log('Campaign created:', campaignData.campaignId);
                setCreatedCampaignId(campaignData.campaignId);

                // Update progress: Campaign done, starting Ad Set
                setPublishProgress(prev => prev ? {
                    ...prev,
                    currentStep: 'adSet',
                    campaignStatus: 'done',
                    adSetStatus: 'in-progress'
                } : prev);

                // Step 2: Create Ad Set
                const adSetRes = await authedFetch('/api/meta/adset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        adAccountId: metaConnection.selectedAdAccountId,
                        campaignId: campaignData.campaignId,
                        name: settings.adSetName,
                        dailyBudget: settings.budgetLevel === 'adset' ? settings.dailyBudget : undefined,
                        budgetLevel: settings.budgetLevel,
                        optimizationGoal: settings.optimizationGoal,
                        isASC: settings.campaignType === 'ASC',
                        specialAdCategories: settings.specialAdCategories,
                        pixelId: settings.pixelId,
                        conversionEvent: settings.conversionEvent,
                        useIncrementalAttribution: settings.objective === 'OUTCOME_SALES' ? settings.useIncrementalAttribution : false,
                        pageId: metaConnection.selectedPageId,
                        objective: settings.objective,
                        ageMin: globalSettings.defaultAgeMin,
                        startTime: settings.scheduledStartDate || undefined,
                    }),
                });

                const adSetData = await adSetRes.json();
                console.log('Ad Set API Response:', adSetRes.status, JSON.stringify(adSetData, null, 2));
                if (!adSetData.success) {
                    // Log full error details for debugging
                    console.error('Ad Set creation failed - Full Response:', JSON.stringify(adSetData, null, 2));
                    throw new Error(adSetData.error || 'Failed to create ad set');
                }
                console.log('Ad Set created:', adSetData.adSetId);

                targetAdSetId = adSetData.adSetId;

                // Update progress: Ad Set done
                setPublishProgress(prev => prev ? {
                    ...prev,
                    currentStep: 'ads',
                    adSetStatus: 'done'
                } : prev);
            }

            if (!targetAdSetId) {
                throw new Error('No ad set available. Please select an existing ad set or configure a new campaign.');
            }

            // Get URL parameters from global settings (from hook)
            const urlParameters = globalSettings.urlParameters || '';

            // Rows often share Drive files (same creatives, different copy).
            // Concurrent workers renaming the same file would interleave and
            // leave a stack's files named after different ads, so each file is
            // renamed only by the first row (in start order) that uses it.
            const renameClaims = new Set<string>();

            // Process each ad — pipelines run concurrently via a bounded pool.
            // Each returns its own result; the pool writes them back in ad order.
            const publishOneAd = async (ad: AdRow): Promise<AdPublishResult> => {
                // Claim synchronously, before any await, so claims follow start order
                const myRenames = new Set<string>();
                for (const asset of ad.assets) {
                    if (asset.driveFileId && !renameClaims.has(asset.driveFileId)) {
                        renameClaims.add(asset.driveFileId);
                        myRenames.add(asset.driveFileId);
                    }
                }

                // Mark in-flight. Counters use functional setState so concurrent
                // workers compose without clobbering each other.
                setPublishProgress(prev => prev ? {
                    ...prev,
                    currentStep: 'ads',
                    adsInFlight: (prev.adsInFlight ?? 0) + 1,
                } : prev);

                try {
                    // Get per-ad overrides or use defaults, falling back to the ad's own URL
                    const overrides = settings.adOverrides[ad.id] || {};
                    const destinationUrl = overrides.destinationUrl || settings.destinationUrl || ad.slots.destinationUrl;
                    const callToAction = overrides.callToAction || settings.callToAction || ad.callToAction || 'LEARN_MORE';

                    if (!destinationUrl) {
                        return {
                            rowId: ad.id,
                            adName: ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`,
                            success: false,
                            error: 'No destination URL specified',
                        };
                    }

                    // Upload assets using server-side Drive-to-Meta transfer to avoid CORS
                    const imageHashes: string[] = [];
                    const videoIds: string[] = [];
                    // Carousel cards and multi-media items must keep the row's
                    // asset order — collect uploads in sequence (imageHashes/videoIds
                    // split by type and lose the interleaved ordering). Dimensions and
                    // stack index ride along so multi-media can group orientation variants.
                    const orderedCards: Array<{ type: 'image' | 'video'; name?: string; hash?: string; videoId?: string; width?: number; height?: number; stack?: number }> = [];
                    const adName = ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`;

                    // Upload assets — for single_image/single_video, only upload the first asset
                    // (remaining assets are morph references for the creative builder)
                    const isSingleAd = ad.adType === 'single_image' || ad.adType === 'single_video';
                    const isCarousel = ad.adType === 'carousel';
                    const isMultiMedia = ad.adType === 'multi_media';
                    const assetsToUpload = isSingleAd ? ad.assets.slice(0, 1) : ad.assets;

                    // Multi-media: stack orientation variants by file name — the same
                    // buildStacks the confirm step shows, computed from the names
                    // BEFORE the rename below overwrites them in Drive
                    const stackOf = new Map<number, { index: number; tag?: string; size: number }>();
                    if (isMultiMedia) {
                        buildStacks(assetsToUpload).forEach((stack, index) =>
                            stack.members.forEach((member, k) => {
                                const variant = stack.variants[k];
                                stackOf.set(member, { index, tag: variant && VARIANT_FILE_TAGS[variant], size: stack.members.length });
                            })
                        );
                    }

                    for (const [assetIndex, asset] of assetsToUpload.entries()) {
                        try {
                            // Step 1: Rename file in Drive to match structured ad name
                            if (asset.driveFileId && driveAccessToken) {
                                // Multi-media names files by stack + shape (AdName_2_1x1,
                                // AdName_2_9x16) so stacks stay recoverable on reuse
                                const stackInfo = stackOf.get(assetIndex);
                                const suffix = ad.assets.length <= 1 ? ''
                                    : stackInfo
                                        ? `_${stackInfo.index + 1}${stackInfo.tag ? `_${stackInfo.tag}` : ''}`
                                        : `_${assetIndex + 1}`;

                                // Extension from the real Drive file name — asset.name has
                                // it stripped (and may contain dots, e.g. "Toast_1.91x1")
                                const extMatch = asset.originalName?.match(/\.([a-z0-9]{2,5})$/i);
                                const ext = extMatch ? extMatch[1].toLowerCase() : asset.type === 'video' ? 'mp4' : 'jpg';

                                const newFileName = `${adName}${suffix}.${ext}`;

                                if (myRenames.has(asset.driveFileId)) {
                                    console.log(`Renaming Drive file to: ${newFileName}`);
                                    try {
                                        await authedFetch('/api/drive/rename', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                googleAccessToken: driveAccessToken,
                                                fileId: asset.driveFileId,
                                                newName: newFileName,
                                            }),
                                        });
                                    } catch (renameError) {
                                        console.warn('File rename failed (continuing anyway):', renameError);
                                    }
                                }

                                // Step 2: Upload to Meta via server-side proxy
                                const transferRes = await authedFetch('/api/meta/upload/from-drive', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        googleAccessToken: driveAccessToken,
                                        adAccountId: metaConnection.selectedAdAccountId,
                                        driveFileId: asset.driveFileId,
                                        assetType: asset.type,
                                        fileName: newFileName,
                                    }),
                                });

                                const transferData = await transferRes.json();

                                if (transferData.success) {
                                    if (transferData.type === 'image' && transferData.hash) {
                                        imageHashes.push(transferData.hash);
                                        orderedCards.push({ type: 'image', name: asset.name, hash: transferData.hash, ...asset.dimensions, stack: stackOf.get(assetIndex)?.index });
                                    } else if (transferData.type === 'video' && transferData.videoId) {
                                        videoIds.push(transferData.videoId);
                                        orderedCards.push({ type: 'video', name: asset.name, videoId: transferData.videoId, ...asset.dimensions, stack: stackOf.get(assetIndex)?.index });
                                    }
                                } else {
                                    console.error('Drive-to-Meta transfer failed:', transferData.error);
                                }
                            } else {
                                console.warn('Asset missing driveFileId or no Drive token:', asset.id);
                            }
                        } catch (assetError) {
                            console.error('Error processing asset:', asset.id, assetError);
                        }
                    }

                    // Validate we have at least one asset uploaded
                    if (imageHashes.length === 0 && videoIds.length === 0) {
                        return {
                            rowId: ad.id,
                            adName: ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`,
                            success: false,
                            error: 'No assets could be uploaded',
                            errorDetail: 'The file transfer from Google Drive to Meta failed. This usually means your Google Drive session expired during the batch. Try reconnecting Drive and re-publishing this ad.',
                        };
                    }

                    // Carousels pair Card N = Asset N + Headline N, so every asset
                    // must upload — a missing card would silently shift the deck
                    if (isCarousel && orderedCards.length < Math.max(CAROUSEL_MIN_CARDS, ad.assets.length)) {
                        return {
                            rowId: ad.id,
                            adName,
                            success: false,
                            error: orderedCards.length < CAROUSEL_MIN_CARDS
                                ? 'Carousel needs at least 2 cards'
                                : 'Carousel is missing cards',
                            errorDetail: `Only ${orderedCards.length} of ${ad.assets.length} asset(s) uploaded successfully. Carousel cards pair with headlines by position, so publishing with missing cards would shift the deck — check the failed transfers and republish.`,
                        };
                    }

                    // Every other type must also get every asset it was built with —
                    // publishing a flexible ad with some assets silently missing
                    // isn't the ad the strategist assembled
                    if (!isCarousel && orderedCards.length < assetsToUpload.length) {
                        return {
                            rowId: ad.id,
                            adName,
                            success: false,
                            error: 'Some assets failed to upload',
                            errorDetail: `Only ${orderedCards.length} of ${assetsToUpload.length} asset(s) uploaded successfully, so the ad wasn't published with a partial set. Check the failed transfers (often an expired Drive session — try reconnecting Drive) and republish.`,
                        };
                    }

                    // Extract text from SlotItems (SlotItem has localText or masterItem.text)
                    const getSlotText = (slot: { localText?: string; masterItem: { text: string } } | null): string | null => {
                        if (!slot) return null;
                        return slot.localText || slot.masterItem.text;
                    };

                    // Carousels publish only Primary Text 1 (the message above all
                    // cards) — text lingering in hidden slots 2–5 must not leak in
                    const primaryTexts = (isCarousel
                        ? (ad.slots.primaryTexts || []).slice(0, 1)
                        : (ad.slots.primaryTexts || []))
                        .map(getSlotText)
                        .filter((t): t is string => t !== null && t.trim() !== '');

                    // Carousel headlines pair by position (Card N = Headline N), so
                    // empty slots stay as '' — compacting them like the other types
                    // would shift every later headline onto the wrong card
                    const headlines = isCarousel
                        ? (ad.slots.headlines || [])
                            .slice(0, orderedCards.length)
                            .map(s => (getSlotText(s) || '').trim())
                        : (ad.slots.headlines || [])
                            .map(getSlotText)
                            .filter((t): t is string => t !== null && t.trim() !== '');

                    if (isCarousel && !headlines.some(Boolean)) {
                        return {
                            rowId: ad.id,
                            adName,
                            success: false,
                            error: 'Carousel needs at least one headline',
                            errorDetail: 'Fill at least Headline 1 — carousel cards pair with headlines by position.',
                        };
                    }

                    // Call publish API with adType for routing
                    const selectedPage = metaConnection.pages?.find(p => p.id === metaConnection.selectedPageId);
                    const publishRes = await authedFetch('/api/meta/publish/ad', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            adAccountId: metaConnection.selectedAdAccountId,
                            adSetId: targetAdSetId,
                            pageId: metaConnection.selectedPageId,
                            instagramActorId: selectedPage?.instagramAccountId || '',
                            adName,
                            destinationUrl,
                            callToAction,
                            primaryTexts,
                            headlines,
                            imageHashes,
                            videoIds,
                            urlParameters,
                            status: settings.initialStatus,
                            adType: ad.adType || 'flexible', // Route based on ad type selector
                            ...(isCarousel && { cards: orderedCards }), // Ordered cards for carousel pairing
                            ...(isMultiMedia && { media: orderedCards }), // Ordered media; [0] is primary
                            pixelId: settings.pixelId || '', // Pixel ID for conversion tracking
                            enhancements: settings.enhancements, // Creative enhancement toggles
                        }),
                    });

                    const publishData = await publishRes.json();

                    if (publishData.success) {
                        return {
                            rowId: ad.id,
                            adName: ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`,
                            success: true,
                            metaAdId: publishData.adId,
                            ...(publishData.warning && { warning: publishData.warning }),
                        };
                    } else {
                        console.error('Publish failed for ad:', ad.id, publishData);
                        return {
                            rowId: ad.id,
                            adName: ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`,
                            success: false,
                            error: publishData.error || 'Failed to create ad',
                            errorDetail: classifyPublishError(publishData),
                        };
                    }
                } catch (adError) {
                    console.error('Error publishing ad:', ad.id, adError);
                    return {
                        rowId: ad.id,
                        adName: ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`,
                        success: false,
                        error: adError instanceof Error ? adError.message : 'Unknown error',
                        errorDetail: 'An unexpected error occurred during publishing. This may be a network issue — check your connection and try again.',
                    };
                } finally {
                    // Runs on every exit path (success, failure, early return) so
                    // the concurrent progress counters stay correct.
                    setPublishProgress(prev => prev ? {
                        ...prev,
                        adsInFlight: Math.max(0, (prev.adsInFlight ?? 1) - 1),
                        adsCompleted: prev.adsCompleted + 1,
                    } : prev);
                }
            };

            // Reset ads-phase counters, then publish concurrently (bounded pool).
            // The pool finishes any in-flight ads on Stop but starts no new ones.
            setPublishProgress(prev => prev ? { ...prev, currentStep: 'ads', adsCompleted: 0, adsInFlight: 0 } : prev);

            const settled = await runPool(
                selectedAds,
                PUBLISH_CONCURRENCY,
                publishOneAd,
                () => abortPublishRef.current,
            );
            for (const r of settled) {
                if (r) results.push(r);
            }

            setPublishResults(results);

            // Mark progress complete or stopped
            const wasStopped = abortPublishRef.current;
            setPublishProgress(prev => prev ? {
                ...prev,
                currentStep: wasStopped ? 'stopped' : 'complete',
                adsCompleted: results.length,
                adsInFlight: 0,
                currentAdName: undefined,
            } : prev);

            // Notify parent of completion so it can update row status
            if (onPublishComplete) {
                onPublishComplete(results);
            }
        } catch (error) {
            console.error('Publish failed:', error);
            setPublishResults([{
                rowId: 'error',
                adName: 'Publish Error',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            }]);
        } finally {
            setIsPublishing(false);
        }
    };

    const handleClose = () => {
        // Reset state on close
        setCurrentStep(1);
        setPublishResults(null);
        setSettings(makeInitialSettings(campaignName, defaultAdSetName));
        setCreatedCampaignId(null);
        setPublishProgress(null);
        abortPublishRef.current = false;
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={(e) => e.target === e.currentTarget && !isPublishing && handleClose()}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="relative w-full max-w-4xl max-h-[85vh] bg-background-secondary border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                        <div>
                            <h2 className="text-xl font-semibold text-foreground">Publish to Meta</h2>
                            <p className="text-sm text-foreground-muted">
                                Publishing {selectedAds.length} ad{selectedAds.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            disabled={isPublishing}
                            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                        >
                            <X className="w-5 h-5 text-foreground-muted" />
                        </button>
                    </div>

                    {/* Step Indicator */}
                    <div className="flex items-center justify-center gap-2 px-6 py-4 bg-background-tertiary/50">
                        {STEPS.map((step, index) => (
                            <React.Fragment key={step.id}>
                                <div
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${currentStep === step.id
                                        ? 'bg-cyan-500 text-white'
                                        : currentStep > step.id
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : 'bg-background-tertiary text-foreground-muted'
                                        }`}
                                >
                                    {currentStep > step.id ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/20 text-xs">
                                            {step.id}
                                        </span>
                                    )}
                                    <span className="hidden sm:inline">{step.label}</span>
                                </div>
                                {index < STEPS.length - 1 && (
                                    <ChevronRight className="w-4 h-4 text-foreground-subtle" />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                {/* Connection Status */}
                                <ConnectionStatus />

                                {/* Campaign Target Step */}
                                <CampaignTargetStep
                                    settings={settings}
                                    onUpdate={updateSettings}
                                    metaConnection={metaConnection}
                                    globalSettings={globalSettings}
                                />
                            </div>
                        )}
                        {currentStep === 2 && (
                            <CampaignConfigStep
                                settings={settings}
                                onUpdate={updateSettings}
                                selectedAds={selectedAds}
                            />
                        )}
                        {currentStep === 3 && (
                            <CreativeConfirmStep
                                settings={settings}
                                selectedAds={selectedAds}
                                onUpdate={updateSettings}
                            />
                        )}
                        {currentStep === 4 && (
                            <ReviewPublishStep
                                settings={settings}
                                selectedAds={selectedAds}
                                onUpdate={updateSettings}
                                publishResults={publishResults}
                                isPublishing={isPublishing}
                                publishProgress={publishProgress}
                                driveFolderUrl={driveFolderUrl ?? undefined}
                                metaCampaignId={createdCampaignId ?? settings.existingCampaignId ?? undefined}
                                metaAdAccountId={metaConnection?.selectedAdAccountId ?? undefined}
                            />
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-background-tertiary/50">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 1 || isPublishing || publishResults !== null}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>

                        <div className="flex items-center gap-3">
                            {isPublishing && !publishResults && (
                                <button
                                    onClick={() => { abortPublishRef.current = true; }}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 hover:text-red-300 transition-colors font-medium text-sm"
                                >
                                    <StopCircle className="w-4 h-4" />
                                    Stop Publishing
                                </button>
                            )}
                            {publishResults && (
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 rounded-lg bg-background-tertiary text-foreground hover:bg-background transition-colors"
                                >
                                    Close
                                </button>
                            )}

                            {currentStep < 4 ? (
                                <button
                                    onClick={handleNext}
                                    disabled={!canProceed}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-500 text-white font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Continue
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : !publishResults ? (
                                <div className="flex items-center gap-3">
                                    {/* Validation UI */}
                                    {validation.status === 'validating' && (
                                        <div className="flex items-center gap-2 text-sm text-foreground-muted">
                                            <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
                                            Validating connections...
                                        </div>
                                    )}
                                    {validation.status === 'failed' && (
                                        <div className="flex items-center gap-2">
                                            {!validation.meta.valid && (
                                                <button
                                                    onClick={handleMetaReconnect}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                                                >
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    Reconnect Meta
                                                </button>
                                            )}
                                            {!validation.drive.valid && (
                                                <button
                                                    onClick={handleDriveReconnect}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
                                                >
                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                    Reconnect Drive
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        onClick={handlePublish}
                                        disabled={isPublishing || validation.status === 'validating'}
                                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-500 text-white font-medium hover:bg-cyan-600 transition-colors disabled:opacity-50"
                                    >
                                        {isPublishing ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Publishing...
                                            </>
                                        ) : validation.status === 'validating' ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Validating...
                                            </>
                                        ) : validation.status === 'failed' ? (
                                            'Retry Publish'
                                        ) : (
                                            'Publish to Meta'
                                        )}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
