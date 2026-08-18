'use client';

import React, { useState } from 'react';
import { AlertTriangle, Info, Lock, ChevronDown, Sparkles, Zap, Calendar, X } from 'lucide-react';
import { WizardSettings, CampaignObjective, SpecialAdCategory, OptimizationGoal, ConversionEvent, CreativeEnhancements, BudgetLevel } from './index';
import { AdRow } from '@/types';

// Objectives supported by Flexible Ads (from Meta docs)
const FLEXIBLE_AD_OBJECTIVES: CampaignObjective[] = ['OUTCOME_SALES', 'OUTCOME_APP_PROMOTION'];

// Enhancement toggles — surfaced in UI for per-publish control
const ENHANCEMENT_TOGGLES: Array<{ key: keyof CreativeEnhancements; label: string; description: string }> = [
    // Essential enhancements (match Ads Manager "Essential enhancements" panel)
    { key: 'show_summary', label: 'Show Summaries', description: 'AI-generated selling points or review summaries above ad' },
    { key: 'inline_comment', label: 'Relevant Comments', description: 'Display the most relevant comment below your ad' },
    { key: 'enhance_cta', label: 'Enhance CTA', description: 'Pair AI keyphrases with your call-to-action' },
    { key: 'image_brightness_and_contrast', label: 'Adjust Brightness & Contrast', description: 'Subtle color tweaks to improve performance' },
    { key: 'reveal_details_over_time', label: 'Reveal Details Over Time', description: 'Show a screenshot of your destination page' },
    { key: 'site_extensions', label: 'Show Spotlights', description: 'Website highlights from your creative setup' },
    // Media, text & format enhancements
    { key: 'text_optimizations', label: 'Text Improvements', description: 'Add feature headlines using phrases from your text options' },
    { key: 'image_animation', label: 'Add Animation', description: 'Animate image and/or text to increase visual interest' },
    { key: 'add_text_overlay', label: 'Dynamic Overlays', description: 'Add catalog item info as visually-unique overlays' },
    { key: 'image_templates', label: 'Add Overlays', description: 'Add text overlays to images for richer visuals' },
    { key: 'image_touchups', label: 'Visual Touch-ups', description: 'Expand and reposition images to fit more placements' },
    { key: 'adapt_to_placement', label: 'Image Touch-ups', description: 'Reformat and crop creative for Stories, Reels, etc.' },
    { key: 'product_extensions', label: 'Product Extensions', description: 'Show related products from catalog' },
    { key: 'video_auto_crop', label: 'Video Auto Crop', description: 'Crop videos to fit more placements' },
];

interface CampaignConfigStepProps {
    settings: WizardSettings;
    onUpdate: (updates: Partial<WizardSettings>) => void;
    selectedAds: AdRow[]; // To check if any ads are flexible
}

// Objectives with their corresponding optimization goals
const OBJECTIVES: {
    id: CampaignObjective;
    label: string;
    description: string;
    optimizationGoals: { id: OptimizationGoal; label: string; description: string }[];
}[] = [
        {
            id: 'OUTCOME_AWARENESS',
            label: 'Awareness',
            description: 'Maximize reach and brand recall',
            optimizationGoals: [
                { id: 'REACH', label: 'Reach', description: 'Show to as many people as possible' },
                { id: 'THRUPLAY', label: 'ThruPlay', description: 'Video views (15s or complete)' },
                { id: 'AD_RECALL_LIFT', label: 'Ad Recall', description: 'Maximize brand memory' },
            ]
        },
        {
            id: 'OUTCOME_ENGAGEMENT',
            label: 'Engagement',
            description: 'Get more video views and interactions',
            optimizationGoals: [
                { id: 'THRUPLAY', label: 'ThruPlay', description: 'Video views (15s or complete)' },
                { id: 'POST_ENGAGEMENT', label: 'Post Engagement', description: 'Likes, comments, shares' },
                { id: 'TWO_SECOND_CONTINUOUS_VIDEO_VIEWS', label: '2-Second Views', description: 'Quick video impressions' },
            ]
        },
        {
            id: 'OUTCOME_TRAFFIC',
            label: 'Traffic',
            description: 'Send people to a destination',
            optimizationGoals: [
                { id: 'LANDING_PAGE_VIEWS', label: 'Landing Page Views', description: 'People who load your page' },
                { id: 'LINK_CLICKS', label: 'Link Clicks', description: 'Any click on your ad' },
            ]
        },
        {
            id: 'OUTCOME_LEADS',
            label: 'Leads',
            description: 'Collect lead information',
            optimizationGoals: [
                { id: 'LEAD_GENERATION', label: 'Lead Forms', description: 'Form submissions on Facebook' },
                { id: 'QUALITY_LEAD', label: 'Quality Leads', description: 'Higher-intent leads (requires CRM integration)' },
                { id: 'CONVERSATIONS', label: 'Conversations', description: 'Start Messenger/WhatsApp chats' },
            ]
        },
        {
            id: 'OUTCOME_SALES',
            label: 'Sales',
            description: 'Drive purchases and conversions',
            optimizationGoals: [
                { id: 'OFFSITE_CONVERSIONS', label: 'Conversions', description: 'Website purchase events' },
                { id: 'VALUE', label: 'Value', description: 'Maximize conversion value (ROAS)' },
            ]
        },
    ];

const SPECIAL_AD_CATEGORIES: { id: SpecialAdCategory; label: string }[] = [
    { id: 'CREDIT', label: 'Credit' },
    { id: 'EMPLOYMENT', label: 'Employment' },
    { id: 'HOUSING', label: 'Housing' },
    { id: 'SOCIAL_ISSUES_ELECTIONS_OR_POLITICS', label: 'Social Issues / Elections / Politics' },
];

const CONVERSION_EVENTS: { id: ConversionEvent; label: string; description: string }[] = [
    { id: 'PURCHASE', label: 'Purchase', description: 'Optimize for completed purchases' },
    { id: 'ADD_TO_CART', label: 'Add to Cart', description: 'Optimize for cart additions' },
    { id: 'INITIATE_CHECKOUT', label: 'Initiate Checkout', description: 'Optimize for checkout starts' },
    { id: 'COMPLETE_REGISTRATION', label: 'Registration', description: 'Optimize for sign-ups' },
    { id: 'LEAD', label: 'Lead', description: 'Optimize for lead submissions' },
    { id: 'OTHER', label: 'Other', description: 'Other conversion event' },
];

export function CampaignConfigStep({ settings, onUpdate, selectedAds }: CampaignConfigStepProps) {
    const isASC = settings.campaignType === 'ASC';
    const isExisting = settings.targetType === 'existing';

    // Floor for the schedule picker (local time), frozen at mount so render
    // stays pure — Meta rejects past start dates anyway
    const [minScheduleDateTime] = useState(
        () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    );

    // Check if any selected ad is flexible - if so, restrict objectives
    const hasFlexibleAds = selectedAds.some(ad => ad.adType === 'flexible');
    const allowedObjectives = hasFlexibleAds ? FLEXIBLE_AD_OBJECTIVES : OBJECTIVES.map(o => o.id);

    const toggleSpecialAdCategory = (category: SpecialAdCategory) => {
        const current = settings.specialAdCategories;
        const isSelected = current.includes(category);
        onUpdate({
            specialAdCategories: isSelected
                ? current.filter(c => c !== category)
                : [...current, category]
        });
    };

    // Get optimization goals for current objective
    const currentObjective = OBJECTIVES.find(o => o.id === settings.objective);
    const optimizationGoals = currentObjective?.optimizationGoals || [];

    // Auto-select first optimization goal when objective changes
    const handleObjectiveChange = (objectiveId: CampaignObjective) => {
        const objective = OBJECTIVES.find(o => o.id === objectiveId);
        const defaultOptimization = objective?.optimizationGoals[0]?.id;
        onUpdate({
            objective: objectiveId,
            optimizationGoal: defaultOptimization || 'LINK_CLICKS',
            useIncrementalAttribution: objectiveId === 'OUTCOME_SALES',
        });
    };

    return (
        <div className="space-y-6">
            {/* Existing Campaign Info */}
            {isExisting && (
                <div className="p-4 rounded-xl bg-background-tertiary border border-border">
                    <h3 className="text-sm font-medium text-foreground-muted mb-2">Publishing to</h3>
                    <p className="text-lg font-semibold text-foreground">{settings.existingCampaignName}</p>
                    <p className="text-sm text-foreground-muted mt-1">
                        {settings.adSetMode === 'new' ? (
                            <>Ad Set: {settings.newAdSetName} <span className="text-cyan-400">(new)</span></>
                        ) : (
                            <>Ad Set: {settings.existingAdSetName}</>
                        )}
                    </p>
                </div>
            )}

            {/* New Campaign Configuration */}
            {!isExisting && (
                <>
                    {/* Flexible Ad Objective Warning */}
                    {hasFlexibleAds && !isASC && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-amber-200">Flexible Ad Objective Restrictions</p>
                                <p className="text-sm text-amber-300/80 mt-1">
                                    Flexible ads only support <strong>Sales</strong> and <strong>App Promotion</strong> objectives.
                                    Other objectives are disabled for this batch.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ASC Warning */}
                    {isASC && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
                            <Lock className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-cyan-200">Advantage+ Shopping Campaign</p>
                                <p className="text-sm text-cyan-300/80 mt-1">
                                    Objective: <strong>Sales</strong> · Optimize: <strong>Conversions</strong> · Pixel required
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Campaign Name (editable) */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Campaign Name
                        </label>
                        <input
                            type="text"
                            value={settings.campaignName}
                            onChange={(e) => onUpdate({ campaignName: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg bg-background-tertiary border border-border focus:border-cyan-500 focus:outline-none text-foreground"
                        />
                    </div>

                    {/* Ad Set Name */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            Ad Set Name
                        </label>
                        <input
                            type="text"
                            value={settings.adSetName}
                            onChange={(e) => onUpdate({ adSetName: e.target.value })}
                            className="w-full px-4 py-3 rounded-lg bg-background-tertiary border border-border focus:border-cyan-500 focus:outline-none text-foreground"
                        />
                        <p className="mt-1 text-xs text-foreground-muted">
                            Default: Campaign name + current date
                        </p>
                    </div>

                    {/* Objective */}
                    {!isASC && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Objective
                            </label>
                            <div className="grid grid-cols-5 gap-2">
                                {OBJECTIVES.map((obj) => {
                                    const isDisabled = !allowedObjectives.includes(obj.id);
                                    return (
                                        <button
                                            key={obj.id}
                                            onClick={() => !isDisabled && handleObjectiveChange(obj.id)}
                                            disabled={isDisabled}
                                            className={`p-3 rounded-lg border text-center transition-all ${settings.objective === obj.id
                                                ? 'border-cyan-500 bg-cyan-500/10'
                                                : isDisabled
                                                    ? 'border-border bg-background-tertiary opacity-40 cursor-not-allowed'
                                                    : 'border-border hover:border-border-hover bg-background-tertiary'
                                                }`}
                                        >
                                            <span className={`block font-medium text-sm ${settings.objective === obj.id ? 'text-cyan-500' : 'text-foreground'
                                                }`}>
                                                {obj.label}
                                            </span>
                                            <span className="text-[10px] text-foreground-muted leading-tight block mt-1">
                                                {obj.description}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Optimization Goal - only show for Standard campaigns with selected objective */}
                    {!isASC && optimizationGoals.length > 0 && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Optimize For
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {optimizationGoals.map((goal) => (
                                    <button
                                        key={goal.id}
                                        onClick={() => onUpdate({ optimizationGoal: goal.id })}
                                        className={`p-3 rounded-lg border text-left transition-all ${settings.optimizationGoal === goal.id
                                            ? 'border-cyan-500 bg-cyan-500/10'
                                            : 'border-border hover:border-border-hover bg-background-tertiary'
                                            }`}
                                    >
                                        <span className={`block font-medium text-sm ${settings.optimizationGoal === goal.id ? 'text-cyan-500' : 'text-foreground'
                                            }`}>
                                            {goal.label}
                                        </span>
                                        <span className="text-xs text-foreground-muted">
                                            {goal.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Conversion Event - visible for ASC or OUTCOME_SALES objective */}
                    {(isASC || settings.objective === 'OUTCOME_SALES') && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Conversion Event
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                {CONVERSION_EVENTS.map((evt) => (
                                    <button
                                        key={evt.id}
                                        onClick={() => onUpdate({ conversionEvent: evt.id })}
                                        className={`p-3 rounded-lg border text-left transition-all ${settings.conversionEvent === evt.id
                                            ? 'border-cyan-500 bg-cyan-500/10'
                                            : 'border-border hover:border-border-hover bg-background-tertiary'
                                            }`}
                                    >
                                        <span className={`block font-medium text-sm ${settings.conversionEvent === evt.id ? 'text-cyan-500' : 'text-foreground'
                                            }`}>
                                            {evt.label}
                                        </span>
                                        <span className="text-xs text-foreground-muted">
                                            {evt.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Budget Level Toggle — Campaign (CBO) vs Ad Set */}
            {!isExisting && (
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Budget Level
                    </label>
                    <div className="flex rounded-lg overflow-hidden border border-border">
                        {[
                            { value: 'campaign' as BudgetLevel, label: 'Campaign (CBO)', description: 'Meta distributes budget across ad sets' },
                            { value: 'adset' as BudgetLevel, label: 'Ad Set', description: 'Each ad set gets its own budget' },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => onUpdate({ budgetLevel: option.value })}
                                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${settings.budgetLevel === option.value
                                    ? 'bg-cyan-500 text-white'
                                    : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">
                        {settings.budgetLevel === 'campaign'
                            ? 'Meta automatically distributes budget across ad sets for best performance'
                            : 'Each ad set manages its own daily budget independently'}
                    </p>
                </div>
            )}

            {/* Daily Budget - Only for new campaigns */}
            {!isExisting && (
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Daily Budget
                    </label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground-muted">$</span>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            value={settings.dailyBudget}
                            onChange={(e) => onUpdate({ dailyBudget: Math.max(1, parseFloat(e.target.value) || 1) })}
                            className="w-full pl-8 pr-4 py-3 rounded-lg bg-background-tertiary border border-border focus:border-cyan-500 focus:outline-none text-foreground"
                        />
                    </div>
                    <p className="mt-1 text-xs text-foreground-muted">
                        Minimum $1.00 per day
                    </p>
                </div>
            )}

            {/* Incremental Attribution - For new Sales campaigns */}
            {!isExisting && settings.objective === 'OUTCOME_SALES' && (
                <div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary border border-border">
                        <div className="flex-1">
                            <span className="block text-sm font-medium text-foreground">
                                Incremental Attribution
                            </span>
                            <span className="block text-xs text-foreground-muted mt-0.5">
                                Optimize for conversions that wouldn&apos;t happen without your ads
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => onUpdate({ useIncrementalAttribution: !settings.useIncrementalAttribution })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${settings.useIncrementalAttribution ? 'bg-cyan-500' : 'bg-gray-600'
                                }`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.useIncrementalAttribution ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                        </button>
                    </div>
                </div>
            )}

            {/* Special Ad Categories - For new campaigns only */}
            {!isExisting && (
                <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Special Ad Categories
                    </label>
                    <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-300">
                            Select if your ads relate to credit, employment, housing, or social/political issues. Required for legal compliance.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {SPECIAL_AD_CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => toggleSpecialAdCategory(cat.id)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${settings.specialAdCategories.includes(cat.id)
                                    ? 'bg-cyan-500 text-white'
                                    : 'bg-background-tertiary border border-border text-foreground-muted hover:text-foreground'
                                    }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                        {settings.specialAdCategories.length === 0 && (
                            <span className="px-3 py-1.5 text-sm text-foreground-muted">None selected</span>
                        )}
                    </div>
                </div>
            )}
            {/* Schedule Start Date — only for new campaigns */}
            {!isExisting && (
                <div className="rounded-xl border border-border bg-background-tertiary p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-foreground-muted" />
                            <span className="text-sm font-medium text-foreground">Schedule Start</span>
                        </div>
                        {settings.scheduledStartDate ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-cyan-400">
                                    {new Date(settings.scheduledStartDate).toLocaleDateString('en-US', {
                                        month: 'short', day: 'numeric', year: 'numeric',
                                    })}{' at '}
                                    {new Date(settings.scheduledStartDate).toLocaleTimeString('en-US', {
                                        hour: 'numeric', minute: '2-digit',
                                    })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onUpdate({ scheduledStartDate: undefined })}
                                    className="p-0.5 rounded hover:bg-background-secondary text-foreground-muted hover:text-foreground transition-colors"
                                    title="Clear date"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ) : (
                            <span className="text-sm text-foreground-muted">When activated</span>
                        )}
                    </div>
                    <input
                        type="datetime-local"
                        value={settings.scheduledStartDate
                            ? new Date(new Date(settings.scheduledStartDate).getTime() - new Date().getTimezoneOffset() * 60000)
                                .toISOString().slice(0, 16)
                            : ''
                        }
                        onChange={(e) => {
                            const val = e.target.value;
                            onUpdate({
                                scheduledStartDate: val ? new Date(val).toISOString() : undefined,
                            });
                        }}
                        min={minScheduleDateTime}
                        className="mt-3 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500 [color-scheme:dark]"
                    />
                    <p className="mt-1.5 text-xs text-foreground-muted">
                        Campaign publishes paused — this date is when delivery begins once activated.
                    </p>
                </div>
            )}

            {/* Creative Enhancements — grouped & collapsible */}
            <EnhancementsPanel settings={settings} onUpdate={onUpdate} />
        </div>
    );
}

// ============================================
// Enhancement Groups & Panel
// ============================================

type EnhancementGroup = {
    id: string;
    label: string;
    icon: React.ReactNode;
    keys: (keyof CreativeEnhancements)[];
};

const ENHANCEMENT_GROUPS: EnhancementGroup[] = [
    {
        id: 'essential',
        label: 'Essential Enhancements',
        icon: <Sparkles className="w-4 h-4" />,
        keys: ['show_summary', 'inline_comment', 'enhance_cta', 'image_brightness_and_contrast', 'reveal_details_over_time', 'site_extensions'],
    },
    {
        id: 'media',
        label: 'Media & Format',
        icon: <Zap className="w-4 h-4" />,
        keys: ['text_optimizations', 'image_animation', 'add_text_overlay', 'image_templates', 'image_touchups', 'adapt_to_placement', 'product_extensions', 'video_auto_crop'],
    },
];

const TOGGLE_META: Record<string, { label: string; description: string }> = {};
ENHANCEMENT_TOGGLES.forEach((t) => { TOGGLE_META[t.key] = { label: t.label, description: t.description }; });

function EnhancementsPanel({ settings, onUpdate }: { settings: WizardSettings; onUpdate: (u: Partial<WizardSettings>) => void }) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ essential: true, media: true });

    const allKeys = ENHANCEMENT_GROUPS.flatMap(g => g.keys);
    const totalOn = allKeys.filter(k => settings.enhancements[k]).length;
    const allOn = totalOn === allKeys.length;

    const handleMasterToggle = () => {
        const newVal = !allOn;
        const updated = { ...settings.enhancements };
        allKeys.forEach(k => { updated[k] = newVal; });
        onUpdate({ enhancements: updated });
    };

    const toggleGroup = (groupId: string) => {
        setExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }));
    };

    return (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 overflow-hidden">
            {/* Section header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-semibold text-foreground">Advantage+ Creative</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${allOn ? 'bg-cyan-500/20 text-cyan-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                        {totalOn}/{allKeys.length} on
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleMasterToggle}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${allOn
                        ? 'bg-gray-600/50 text-foreground-muted hover:bg-gray-600'
                        : 'bg-cyan-500 text-white hover:bg-cyan-600'
                        }`}
                >
                    {allOn ? 'All Off' : 'All On'}
                </button>
            </div>

            {/* Groups */}
            <div className="border-t border-cyan-500/20">
                {ENHANCEMENT_GROUPS.map((group) => {
                    const groupOn = group.keys.filter(k => settings.enhancements[k]).length;
                    const isExpanded = expanded[group.id];

                    return (
                        <div key={group.id}>
                            {/* Group header — clickable */}
                            <button
                                type="button"
                                onClick={() => toggleGroup(group.id)}
                                className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-cyan-500/5 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-cyan-400">{group.icon}</span>
                                    <span className="text-sm font-medium text-foreground">{group.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${groupOn === group.keys.length
                                        ? 'bg-cyan-500/20 text-cyan-300'
                                        : groupOn > 0
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : 'bg-gray-600/50 text-foreground-muted'
                                        }`}>
                                        {groupOn}/{group.keys.length}
                                    </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-foreground-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                                    }`} />
                            </button>

                            {/* Toggles — collapsible */}
                            {isExpanded && (
                                <div className="px-3 pb-2 space-y-1">
                                    {group.keys.map((key) => {
                                        const meta = TOGGLE_META[key];
                                        if (!meta) return null;
                                        const isOn = settings.enhancements[key];
                                        return (
                                            <label
                                                key={key}
                                                className="flex items-center justify-between p-2.5 rounded-lg bg-background-tertiary/60 border border-border/50 hover:border-border-hover transition-colors cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0 mr-3">
                                                    <span className="block text-sm font-medium text-foreground">{meta.label}</span>
                                                    <span className="block text-xs text-foreground-muted">{meta.description}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={isOn}
                                                    onClick={() => onUpdate({
                                                        enhancements: {
                                                            ...settings.enhancements,
                                                            [key]: !isOn,
                                                        },
                                                    })}
                                                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isOn ? 'bg-cyan-500' : 'bg-gray-600'
                                                        }`}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isOn ? 'translate-x-5' : 'translate-x-0'
                                                            }`}
                                                    />
                                                </button>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
