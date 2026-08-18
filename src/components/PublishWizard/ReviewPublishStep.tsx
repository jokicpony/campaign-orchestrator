'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, ExternalLink, Loader2, AlertTriangle, FolderOpen, Circle, ChevronDown, ChevronRight, StopCircle } from 'lucide-react';
import { AdRow, CTA_OPTIONS, DEFAULT_AD_TYPES } from '@/types';
import { WizardSettings, AdPublishResult, PublishProgress } from './index';

interface ReviewPublishStepProps {
    settings: WizardSettings;
    selectedAds: AdRow[];
    onUpdate: (updates: Partial<WizardSettings>) => void;
    publishResults: AdPublishResult[] | null;
    isPublishing: boolean;
    publishProgress?: PublishProgress | null;
    driveFolderUrl?: string | null;
    metaCampaignId?: string;
    metaAdAccountId?: string;
}

export function ReviewPublishStep({
    settings,
    selectedAds,
    publishResults,
    isPublishing,
    publishProgress,
    driveFolderUrl,
    metaCampaignId,
    metaAdAccountId,
}: ReviewPublishStepProps) {
    const isNewCampaign = settings.targetType === 'new';
    const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
    const [settingsExpanded, setSettingsExpanded] = useState(false);

    const getCampaignTypeLabel = (): string => {
        switch (settings.campaignType) {
            case 'ASC': return 'Advantage+ Shopping (ASC)';
            default: return 'Standard';
        }
    };

    const getObjectiveLabel = (): string => {
        switch (settings.objective) {
            case 'OUTCOME_SALES': return 'Sales';
            case 'OUTCOME_TRAFFIC': return 'Traffic';
            case 'OUTCOME_LEADS': return 'Leads';
            default: return settings.objective;
        }
    };

    const getOptimizationLabel = (): string => {
        switch (settings.optimizationGoal) {
            case 'OFFSITE_CONVERSIONS': return 'Conversions';
            case 'VALUE': return 'Value (ROAS)';
            case 'LINK_CLICKS': return 'Link Clicks';
            case 'LANDING_PAGE_VIEWS': return 'Landing Page Views';
            case 'REACH': return 'Reach';
            default: return settings.optimizationGoal;
        }
    };

    const getConversionEventLabel = (): string => {
        switch (settings.conversionEvent) {
            case 'PURCHASE': return 'Purchase';
            case 'ADD_TO_CART': return 'Add to Cart';
            case 'LEAD': return 'Lead';
            case 'COMPLETE_REGISTRATION': return 'Complete Registration';
            default: return settings.conversionEvent;
        }
    };

    const getEffectiveUrl = (ad: AdRow): string => {
        return settings.adOverrides[ad.id]?.destinationUrl ?? ad.slots.destinationUrl ?? '';
    };

    const getEffectiveCta = (ad: AdRow): string => {
        const ctaId = settings.adOverrides[ad.id]?.callToAction ?? ad.callToAction ?? 'LEARN_MORE';
        return CTA_OPTIONS.find(c => c.id === ctaId)?.label || ctaId;
    };

    const successCount = publishResults?.filter(r => r.success).length ?? 0;
    const failCount = publishResults?.filter(r => !r.success).length ?? 0;

    // Debug: Log the IDs being used for the Meta campaign link
    console.log('ReviewPublishStep - Meta link IDs:', {
        metaAdAccountId,
        metaCampaignId,
        cleanedAdAccountId: metaAdAccountId?.replace(/^act_/, '')
    });

    return (
        <div className="space-y-6">
            {/* Publishing Progress - Step-by-step view */}
            {isPublishing && publishProgress && (
                <div className="p-6 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 space-y-4">
                    <div className="text-center mb-4">
                        <h3 className="text-lg font-medium text-cyan-400">Publishing to Meta</h3>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                        {/* Campaign Step - only show for new campaigns */}
                        {settings.targetType === 'new' && (
                            <div className="flex items-center gap-3">
                                {publishProgress.campaignStatus === 'done' ? (
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                ) : publishProgress.campaignStatus === 'in-progress' ? (
                                    <Loader2 className="w-5 h-5 text-cyan-500 animate-spin flex-shrink-0" />
                                ) : publishProgress.campaignStatus === 'error' ? (
                                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                ) : (
                                    <Circle className="w-5 h-5 text-foreground-muted/50 flex-shrink-0" />
                                )}
                                <span className={`text-sm ${publishProgress.campaignStatus === 'done' ? 'text-green-400' : publishProgress.campaignStatus === 'in-progress' ? 'text-cyan-400' : 'text-foreground-muted'}`}>
                                    Creating Campaign
                                </span>
                            </div>
                        )}

                        {/* Ad Set Step - only show for new campaigns */}
                        {settings.targetType === 'new' && (
                            <div className="flex items-center gap-3">
                                {publishProgress.adSetStatus === 'done' ? (
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                ) : publishProgress.adSetStatus === 'in-progress' ? (
                                    <Loader2 className="w-5 h-5 text-cyan-500 animate-spin flex-shrink-0" />
                                ) : publishProgress.adSetStatus === 'error' ? (
                                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                ) : (
                                    <Circle className="w-5 h-5 text-foreground-muted/50 flex-shrink-0" />
                                )}
                                <span className={`text-sm ${publishProgress.adSetStatus === 'done' ? 'text-green-400' : publishProgress.adSetStatus === 'in-progress' ? 'text-cyan-400' : 'text-foreground-muted'}`}>
                                    Creating Ad Set
                                </span>
                            </div>
                        )}

                        {/* Ads Step */}
                        <div className="flex items-center gap-3">
                            {publishProgress.currentStep === 'complete' ? (
                                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                            ) : publishProgress.currentStep === 'stopped' ? (
                                <StopCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            ) : publishProgress.currentStep === 'ads' ? (
                                <Loader2 className="w-5 h-5 text-cyan-500 animate-spin flex-shrink-0" />
                            ) : (
                                <Circle className="w-5 h-5 text-foreground-muted/50 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className={`text-sm ${publishProgress.currentStep === 'complete' ? 'text-green-400' : publishProgress.currentStep === 'stopped' ? 'text-amber-400' : publishProgress.currentStep === 'ads' ? 'text-cyan-400' : 'text-foreground-muted'}`}>
                                        {publishProgress.currentStep === 'stopped'
                                            ? `Stopped — ${publishProgress.adsCompleted}/${publishProgress.adsTotal} ads published`
                                            : `Publishing Ads (${publishProgress.adsCompleted}/${publishProgress.adsTotal})`
                                        }
                                    </span>
                                </div>

                                {/* Progress bar */}
                                {(publishProgress.currentStep === 'ads' || publishProgress.currentStep === 'stopped') && (
                                    <div className="mt-2 space-y-1">
                                        <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${publishProgress.currentStep === 'stopped'
                                                    ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                                                    : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                                                    }`}
                                                style={{ width: `${(publishProgress.adsCompleted / publishProgress.adsTotal) * 100}%` }}
                                            />
                                        </div>
                                        {publishProgress.currentStep === 'ads' && (publishProgress.adsInFlight ?? 0) > 0 && (
                                            <p className="text-xs text-foreground-muted truncate">
                                                Publishing {publishProgress.adsInFlight} ad{publishProgress.adsInFlight === 1 ? '' : 's'} simultaneously…
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Links - shown when complete or stopped */}
                        {(publishProgress.currentStep === 'complete' || publishProgress.currentStep === 'stopped') && (metaCampaignId || driveFolderUrl) && (
                            <div className="flex items-center justify-center gap-3 pt-4 border-t border-cyan-500/20">
                                {metaCampaignId && metaAdAccountId && (
                                    <a
                                        href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAdAccountId.replace(/^act_/, '')}&selected_campaign_ids=${metaCampaignId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-400 hover:text-blue-300 transition-colors text-sm"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>View Campaign in Meta</span>
                                    </a>
                                )}
                                {driveFolderUrl && (
                                    <a
                                        href={driveFolderUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-tertiary hover:bg-background border border-border text-foreground-muted hover:text-foreground transition-colors text-sm"
                                    >
                                        <FolderOpen className="w-4 h-4" />
                                        <span>View Assets in Drive</span>
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Results Summary */}
            {publishResults && !isPublishing && (() => {
                const wasStopped = publishProgress?.currentStep === 'stopped';
                const skippedCount = (publishProgress?.adsTotal ?? 0) - publishResults.length;

                return (
                    <div className={`p-4 rounded-xl border ${wasStopped
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : failCount === 0
                            ? 'bg-green-500/10 border-green-500/30'
                            : successCount === 0
                                ? 'bg-red-500/10 border-red-500/30'
                                : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                        <div className="flex items-center gap-4">
                            {wasStopped ? (
                                <StopCircle className="w-8 h-8 text-amber-500" />
                            ) : failCount === 0 ? (
                                <CheckCircle className="w-8 h-8 text-green-500" />
                            ) : successCount === 0 ? (
                                <XCircle className="w-8 h-8 text-red-500" />
                            ) : (
                                <AlertTriangle className="w-8 h-8 text-amber-500" />
                            )}
                            <div>
                                <p className="font-semibold text-foreground">
                                    {wasStopped
                                        ? 'Publishing halted'
                                        : failCount === 0
                                            ? 'All ads published successfully!'
                                            : successCount === 0
                                                ? 'Publishing failed'
                                                : 'Partially published'}
                                </p>
                                <p className="text-sm text-foreground-muted">
                                    {wasStopped
                                        ? `${successCount} published, ${skippedCount} skipped${failCount > 0 ? `, ${failCount} failed` : ''}`
                                        : `${successCount} succeeded, ${failCount} failed`}
                                </p>
                                {wasStopped && settings.targetType === 'new' && (
                                    <p className="text-xs text-foreground-muted/70 mt-1">
                                        Campaign and ad set were still created in Meta
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Action Links - shown after completion */}
                        {(metaCampaignId || driveFolderUrl) && (
                            <div className={`flex items-center justify-start gap-3 pt-4 mt-4 border-t ${wasStopped ? 'border-amber-500/20' : 'border-green-500/20'}`}>
                                {metaCampaignId && metaAdAccountId && (
                                    <a
                                        href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAdAccountId.replace(/^act_/, '')}&selected_campaign_ids=${metaCampaignId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-400 hover:text-blue-300 transition-colors text-sm"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>View Campaign in Meta</span>
                                    </a>
                                )}
                                {driveFolderUrl && (
                                    <a
                                        href={driveFolderUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-tertiary hover:bg-background border border-border text-foreground-muted hover:text-foreground transition-colors text-sm"
                                    >
                                        <FolderOpen className="w-4 h-4" />
                                        <span>View Assets in Drive</span>
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Campaign Settings — Collapsible summary */}
            {!isPublishing && !publishResults && (
                <>
                    <div className="rounded-xl border border-border bg-background-tertiary overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setSettingsExpanded(!settingsExpanded)}
                            className="w-full px-4 py-3 bg-background flex items-center justify-between cursor-pointer hover:bg-background-tertiary/50 transition-colors"
                        >
                            <h3 className="font-semibold text-foreground">Campaign Settings</h3>
                            <div className="flex items-center gap-3">
                                {!settingsExpanded && (
                                    <div className="flex items-center gap-2 text-xs text-foreground-muted">
                                        {isNewCampaign ? (
                                            <>
                                                <span className="px-2 py-0.5 rounded bg-background border border-border">
                                                    {getCampaignTypeLabel()}
                                                </span>
                                                <span>·</span>
                                                <span>{getObjectiveLabel()}</span>
                                                <span>·</span>
                                                <span className="text-foreground">${settings.dailyBudget.toFixed(0)}/day</span>
                                                <span>·</span>
                                                <span>{settings.budgetLevel === 'campaign' ? 'CBO' : 'Ad Set Budget'}</span>
                                                {settings.objective === 'OUTCOME_SALES' && settings.useIncrementalAttribution && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="text-green-400">Incremental</span>
                                                    </>
                                                )}
                                                {settings.scheduledStartDate && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="text-cyan-400">📅 {new Date(settings.scheduledStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                    </>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <span>Existing: {settings.existingCampaignName}</span>
                                                <span>·</span>
                                                <span>{settings.adSetMode === 'new' ? `${settings.newAdSetName} (new)` : settings.existingAdSetName}</span>
                                            </>
                                        )}
                                    </div>
                                )}
                                {settingsExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-foreground-muted" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 text-foreground-muted" />
                                )}
                            </div>
                        </button>

                        {settingsExpanded && (
                            <div className="p-4 border-t border-border space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-foreground-muted text-xs">Target</span>
                                        <p className="font-medium text-foreground">
                                            {isNewCampaign ? 'New Campaign' : 'Existing'}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-foreground-muted text-xs">Campaign Name</span>
                                        <p className="font-medium text-foreground truncate">
                                            {isNewCampaign ? settings.campaignName : settings.existingCampaignName}
                                        </p>
                                    </div>
                                    {isNewCampaign && (
                                        <>
                                            <div>
                                                <span className="text-foreground-muted text-xs">Type</span>
                                                <p className="font-medium text-foreground">{getCampaignTypeLabel()}</p>
                                            </div>
                                            <div>
                                                <span className="text-foreground-muted text-xs">Objective</span>
                                                <p className="font-medium text-foreground">{getObjectiveLabel()}</p>
                                            </div>
                                        </>
                                    )}
                                    <div>
                                        <span className="text-foreground-muted text-xs">Ad Set</span>
                                        <p className="font-medium text-foreground truncate">
                                            {isNewCampaign
                                                ? settings.adSetName
                                                : settings.adSetMode === 'new'
                                                    ? `${settings.newAdSetName} (new)`
                                                    : settings.existingAdSetName}
                                        </p>
                                    </div>
                                    {isNewCampaign && (
                                        <div>
                                            <span className="text-foreground-muted text-xs">Initial Status</span>
                                            <p className="font-medium text-foreground">
                                                {settings.initialStatus === 'ACTIVE' ? (
                                                    <span className="text-green-400">Active</span>
                                                ) : (
                                                    <span className="text-amber-400">Paused</span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {isNewCampaign && (
                                    <>
                                        <div className="border-t border-border pt-3">
                                            <p className="text-xs font-medium text-foreground-muted mb-2 uppercase tracking-wider">Budget & Optimization</p>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <span className="text-foreground-muted text-xs">Budget Level</span>
                                                    <p className="font-medium text-foreground">
                                                        {settings.budgetLevel === 'campaign' ? (
                                                            <span className="flex items-center gap-1.5">
                                                                Campaign (CBO)
                                                                <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-400">Auto</span>
                                                            </span>
                                                        ) : 'Ad Set Level'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <span className="text-foreground-muted text-xs">Daily Budget</span>
                                                    <p className="font-medium text-foreground">${settings.dailyBudget.toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <span className="text-foreground-muted text-xs">Bid Strategy</span>
                                                    <p className="font-medium text-foreground">Lowest Cost (Auto)</p>
                                                </div>
                                                <div>
                                                    <span className="text-foreground-muted text-xs">Optimization Goal</span>
                                                    <p className="font-medium text-foreground">{getOptimizationLabel()}</p>
                                                </div>
                                                {settings.objective === 'OUTCOME_SALES' && (
                                                    <>
                                                        <div>
                                                            <span className="text-foreground-muted text-xs">Conversion Event</span>
                                                            <p className="font-medium text-foreground">{getConversionEventLabel()}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-foreground-muted text-xs">Pixel</span>
                                                            <p className="font-medium text-foreground">
                                                                {settings.pixelId ? (
                                                                    <span className="font-mono text-xs">•••{settings.pixelId.slice(-4)}</span>
                                                                ) : (
                                                                    <span className="text-amber-400">Not set</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <span className="text-foreground-muted text-xs">Incremental Attribution</span>
                                                            <p className="font-medium text-foreground">
                                                                {settings.useIncrementalAttribution ? (
                                                                    <span className="text-green-400">Enabled</span>
                                                                ) : (
                                                                    <span className="text-foreground-muted">Disabled</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {settings.scheduledStartDate && (
                                            <div className="border-t border-border pt-3">
                                                <p className="text-xs font-medium text-foreground-muted mb-2 uppercase tracking-wider">Schedule</p>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <span className="text-foreground-muted text-xs">Scheduled Start</span>
                                                        <p className="font-medium text-cyan-400">
                                                            {new Date(settings.scheduledStartDate).toLocaleDateString('en-US', {
                                                                month: 'short', day: 'numeric', year: 'numeric',
                                                            })}{' at '}
                                                            {new Date(settings.scheduledStartDate).toLocaleTimeString('en-US', {
                                                                hour: 'numeric', minute: '2-digit',
                                                            })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="border-t border-border pt-3">
                                            <p className="text-xs font-medium text-foreground-muted mb-2 uppercase tracking-wider">
                                                Creative Enhancements
                                                {(() => {
                                                    const onCount = Object.values(settings.enhancements).filter(Boolean).length;
                                                    const total = Object.keys(settings.enhancements).length;
                                                    return (
                                                        <span className="ml-2 text-foreground-muted/60">
                                                            {onCount}/{total}
                                                        </span>
                                                    );
                                                })()}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {([
                                                    { key: 'show_summary', label: 'Show Summaries' },
                                                    { key: 'inline_comment', label: 'Relevant Comments' },
                                                    { key: 'enhance_cta', label: 'Enhance CTA' },
                                                    { key: 'image_brightness_and_contrast', label: 'Brightness & Contrast' },
                                                    { key: 'reveal_details_over_time', label: 'Reveal Details' },
                                                    { key: 'site_extensions', label: 'Show Spotlights' },
                                                    { key: 'text_optimizations', label: 'Text Improvements' },
                                                    { key: 'image_animation', label: 'Add Animation' },
                                                    { key: 'add_text_overlay', label: 'Dynamic Overlays' },
                                                    { key: 'image_templates', label: 'Add Overlays' },
                                                    { key: 'image_touchups', label: 'Visual Touch-ups' },
                                                    { key: 'adapt_to_placement', label: 'Image Touch-ups' },
                                                    { key: 'product_extensions', label: 'Product Extensions' },
                                                    { key: 'video_auto_crop', label: 'Video Auto Crop' },
                                                ] as { key: keyof typeof settings.enhancements; label: string }[]).map(({ key, label }) => {
                                                    const enabled = settings.enhancements[key];
                                                    return (
                                                        <span
                                                            key={key}
                                                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${enabled
                                                                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                                                                : 'bg-background text-foreground-muted/40 border border-border/50'
                                                                }`}
                                                        >
                                                            {enabled ? '✓' : '✗'} {label}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {isNewCampaign && settings.specialAdCategories.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                            <div className="px-4 py-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                                <span className="text-sm font-medium text-amber-400">Special Ad Categories:</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {settings.specialAdCategories.map(cat => (
                                        <span key={cat} className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            {cat.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Ad Manifest */}
            <div className="rounded-xl border border-border bg-background-tertiary overflow-hidden">
                <div className="px-4 py-3 bg-background border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-foreground">Ad Manifest</h3>
                    <span className="text-sm text-foreground-muted">{selectedAds.length} ads</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-background-tertiary/50">
                            <tr className="text-left text-foreground-muted">
                                <th className="px-4 py-2 font-medium">Ad Name</th>
                                <th className="px-4 py-2 font-medium">Type</th>
                                <th className="px-4 py-2 font-medium">URL</th>
                                <th className="px-4 py-2 font-medium">CTA</th>
                                <th className="px-4 py-2 font-medium">Assets</th>
                                <th className="px-4 py-2 font-medium">Copy</th>
                                {publishResults && <th className="px-4 py-2 font-medium">Status</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {selectedAds.map((ad) => {
                                const result = publishResults?.find(r => r.rowId === ad.id);
                                // Carousels publish only Primary Text 1
                                const ptCount = (ad.adType === 'carousel'
                                    ? ad.slots.primaryTexts.slice(0, 1)
                                    : ad.slots.primaryTexts
                                ).filter(Boolean).length;
                                const hlCount = ad.slots.headlines.filter(Boolean).length;

                                return (
                                    <React.Fragment key={ad.id}>
                                        <tr className="text-foreground">
                                            <td className="px-4 py-3 font-medium max-w-64 relative group">
                                                <span className="truncate block">
                                                    {ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`}
                                                </span>
                                                {/* Instant custom tooltip - appears ABOVE */}
                                                <div className="absolute left-0 bottom-full mb-1 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none">
                                                    <div className="px-3 py-2 rounded-lg bg-black text-white text-sm font-normal shadow-xl border-2 border-cyan-400 whitespace-nowrap max-w-md ring-2 ring-cyan-400/30">
                                                        {ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded text-xs bg-background">
                                                    {DEFAULT_AD_TYPES.find(t => t.id === ad.adType)?.namingAlias || '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 group">
                                                <div className="flex items-center gap-1 text-foreground-muted max-w-32">
                                                    <span className="truncate" title={getEffectiveUrl(ad) || 'No URL set'}>
                                                        {getEffectiveUrl(ad) || '—'}
                                                    </span>
                                                    {getEffectiveUrl(ad) && (
                                                        <a
                                                            href={getEffectiveUrl(ad)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1 rounded hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                                            title="Test link in new tab"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">{getEffectiveCta(ad)}</td>
                                            <td className="px-4 py-3">{ad.assets.length}</td>
                                            <td className="px-4 py-3">{ptCount} PT, {hlCount} HL</td>
                                            {publishResults && (
                                                <td className="px-4 py-3">
                                                    {result?.success ? (
                                                        <div className="flex items-center gap-2">
                                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                                            <span className="text-green-400 text-xs">Published</span>
                                                        </div>
                                                    ) : result ? (
                                                        <button
                                                            onClick={() => setExpandedErrorId(expandedErrorId === ad.id ? null : ad.id)}
                                                            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                                        >
                                                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                                            <span className="text-xs truncate max-w-28">{result.error}</span>
                                                            {result.errorDetail && (
                                                                expandedErrorId === ad.id
                                                                    ? <ChevronDown className="w-3 h-3 flex-shrink-0" />
                                                                    : <ChevronRight className="w-3 h-3 flex-shrink-0" />
                                                            )}
                                                        </button>
                                                    ) : null}
                                                </td>
                                            )}
                                        </tr>
                                        {/* Expandable error detail row */}
                                        {result && !result.success && expandedErrorId === ad.id && result.errorDetail && (
                                            <tr className="bg-red-500/5">
                                                <td colSpan={publishResults ? 7 : 6} className="px-4 py-3">
                                                    <div className="flex gap-3 items-start">
                                                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                        <div className="space-y-1 text-sm">
                                                            <p className="text-foreground-muted">{result.errorDetail}</p>
                                                            <p className="text-xs text-foreground-muted/60 font-mono">API: {result.error}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>


        </div >
    );
}
