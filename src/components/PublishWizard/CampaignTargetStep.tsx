'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { authedFetch } from '@/lib/api/authedFetch';
import { Building2, Plus, Loader2, Activity, Tag } from 'lucide-react';
import { WizardSettings, CampaignType, deriveAdSetDefaults } from './index';
import { MetaConnection } from '@/lib/meta/types';
import { GlobalPromptSettings, DEFAULT_CAMPAIGN_TYPES } from '@/types';

interface CampaignTargetStepProps {
    settings: WizardSettings;
    onUpdate: (updates: Partial<WizardSettings>) => void;
    metaConnection: MetaConnection | null;
    globalSettings: GlobalPromptSettings;
}

interface MetaCampaign {
    id: string;
    name: string;
    status: string;
    objective: string;
    dailyBudget?: number;    // present when the campaign uses CBO
    lifetimeBudget?: number; // present when the campaign uses CBO
}

interface MetaAdSet {
    id: string;
    name: string;
    campaignId: string;
    status: string;
}

interface MetaPixel {
    id: string;
    name: string;
    lastFiredTime?: string;
}

const CAMPAIGN_TYPES: { id: CampaignType; label: string; description: string }[] = [
    { id: 'STANDARD', label: 'Standard', description: 'Full targeting control' },
    { id: 'ASC', label: 'Advantage+ Shopping', description: 'AI-optimized for sales' },
];

export function CampaignTargetStep({ settings, onUpdate, metaConnection, globalSettings }: CampaignTargetStepProps) {
    const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
    const [adSets, setAdSets] = useState<MetaAdSet[]>([]);
    const [pixels, setPixels] = useState<MetaPixel[]>([]);
    const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
    const [isLoadingAdSets, setIsLoadingAdSets] = useState(false);
    const [isLoadingPixels, setIsLoadingPixels] = useState(false);
    const [campaignSearch, setCampaignSearch] = useState('');
    const [adSetSearch, setAdSetSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const adSetSectionRef = useRef<HTMLDivElement>(null);

    // Campaign naming state
    const campaignTemplates = globalSettings.campaignNamingTemplates || [];
    const campaignTypes = globalSettings.campaignTypes || DEFAULT_CAMPAIGN_TYPES;
    const defaultTemplateId = globalSettings.defaultCampaignNamingTemplateId || campaignTemplates[0]?.id || '';
    const [campaignTemplateId, setCampaignTemplateId] = useState(defaultTemplateId);
    const [campaignTokenValues, setCampaignTokenValues] = useState<Record<string, string>>({});
    const hasTemplates = campaignTemplates.length > 0;
    const activeCampaignTemplate = campaignTemplates.find(t => t.id === campaignTemplateId) || campaignTemplates[0];

    // Assemble campaign name from tokens
    const assembledCampaignName = useMemo(() => {
        if (!activeCampaignTemplate) return '';
        const parts = activeCampaignTemplate.tokens.map(tok => {
            if (tok.type === 'auto') {
                if (tok.autoSource === 'date') {
                    const d = new Date();
                    return `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}.${d.getFullYear()}`;
                } else if (tok.autoSource === 'campaignType') {
                    const ct = campaignTypes.find(c => c.id === settings.campaignType);
                    return ct?.namingAlias || settings.campaignType || '';
                }
                return '';
            }
            return campaignTokenValues[tok.key] || '';
        }).map(v => v.replace(/\s+/g, '-')).filter(Boolean);
        return parts.length > 0 ? parts.join(activeCampaignTemplate.separator) : '';
    }, [activeCampaignTemplate, campaignTokenValues, settings.campaignType, campaignTypes]);

    // Push assembled name to wizard settings
    useEffect(() => {
        if (hasTemplates && assembledCampaignName) {
            onUpdate({ campaignName: assembledCampaignName });
        }
    }, [assembledCampaignName, hasTemplates]);

    // Load campaigns when switching to existing mode
    useEffect(() => {
        if (settings.targetType === 'existing' && campaigns.length === 0 && metaConnection) {
            loadCampaigns();
        }
    }, [settings.targetType, metaConnection]);

    // Ad set mode for existing campaigns: reuse one or create a new one
    const adSetMode = settings.adSetMode || 'existing';
    const adSetChosen = adSetMode === 'new'
        ? !!settings.newAdSetName?.trim()
        : !!settings.existingAdSetId;
    const [defaultNewAdSetName] = useState(() => {
        const monthDay = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        return `${settings.campaignName} - ${monthDay}`;
    });

    // Load pixels when a conversion pixel may be needed: new campaigns, or a
    // new ad set inside an existing conversion campaign
    const needsPixelForNewAdSet =
        settings.targetType === 'existing' &&
        settings.adSetMode === 'new' &&
        deriveAdSetDefaults(settings.existingCampaignObjective).needsPixel;

    useEffect(() => {
        if ((settings.targetType === 'new' || needsPixelForNewAdSet) && pixels.length === 0 && metaConnection) {
            loadPixels();
        }
    }, [settings.targetType, needsPixelForNewAdSet, metaConnection]);

    // Load ad sets when campaign is selected
    useEffect(() => {
        if (settings.existingCampaignId && metaConnection) {
            loadAdSets(settings.existingCampaignId);
            // Auto-scroll to ad set section after a brief delay for render
            setTimeout(() => {
                adSetSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [settings.existingCampaignId, metaConnection]);

    const loadPixels = async () => {
        if (!metaConnection?.selectedAdAccountId) {
            console.warn('[Pixels] Skipped: no ad account selected');
            return;
        }

        setIsLoadingPixels(true);
        setError(null);
        try {
            const res = await authedFetch('/api/meta/pixels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adAccountId: metaConnection.selectedAdAccountId,
                }),
            });
            const data = await res.json();

            if (res.ok) {
                const loadedPixels = data.pixels || [];
                setPixels(loadedPixels);
                console.log(`[Pixels] Loaded ${loadedPixels.length} pixel(s)`);
                // Auto-select if only one pixel
                if (loadedPixels.length === 1 && !settings.pixelId) {
                    onUpdate({ pixelId: loadedPixels[0].id });
                }
            } else {
                console.error('[Pixels] API returned error:', {
                    status: res.status,
                    error: data.error,
                    errorCode: data.errorCode,
                    errorType: data.errorType,
                    fbtraceId: data.fbtraceId,
                });
                setError(`Pixel load failed: ${data.error || 'Unknown error'} (code: ${data.errorCode || 'none'})`);
            }
        } catch (err) {
            console.error('[Pixels] Network/fetch error:', err);
            setError('Failed to load pixels — check your connection');
        } finally {
            setIsLoadingPixels(false);
        }
    };

    const loadCampaigns = async () => {
        if (!metaConnection?.selectedAdAccountId) {
            setError('Meta not connected or no ad account selected');
            return;
        }

        setIsLoadingCampaigns(true);
        setError(null);
        try {
            const res = await authedFetch('/api/meta/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adAccountId: metaConnection.selectedAdAccountId,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data.campaigns || []);
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to load campaigns');
            }
        } catch (err) {
            console.error('Failed to load campaigns:', err);
            setError('Failed to load campaigns');
        } finally {
            setIsLoadingCampaigns(false);
        }
    };

    const loadAdSets = async (campaignId: string) => {
        if (!metaConnection) {
            return;
        }

        setIsLoadingAdSets(true);
        setAdSets([]);
        try {
            const res = await authedFetch('/api/meta/adsets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setAdSets(data.adSets || []);
            }
        } catch (err) {
            console.error('Failed to load ad sets:', err);
        } finally {
            setIsLoadingAdSets(false);
        }
    };

    const filteredCampaigns = campaigns.filter(c =>
        c.name.toLowerCase().includes(campaignSearch.toLowerCase())
    );

    const filteredAdSets = adSets.filter(a =>
        a.name.toLowerCase().includes(adSetSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {/* Target Type Selection */}
            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={() => onUpdate({ targetType: 'new' })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${settings.targetType === 'new'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-border hover:border-border-hover bg-background-tertiary'
                        }`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${settings.targetType === 'new' ? 'bg-cyan-500' : 'bg-background'
                            }`}>
                            <Plus className={`w-5 h-5 ${settings.targetType === 'new' ? 'text-white' : 'text-foreground-muted'
                                }`} />
                        </div>
                        <span className="font-semibold text-foreground">Create New Campaign</span>
                    </div>
                    <p className="text-sm text-foreground-muted">
                        Set up a fresh campaign with new ad sets
                    </p>
                </button>

                <button
                    onClick={() => onUpdate({ targetType: 'existing' })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${settings.targetType === 'existing'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-border hover:border-border-hover bg-background-tertiary'
                        }`}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${settings.targetType === 'existing' ? 'bg-cyan-500' : 'bg-background'
                            }`}>
                            <Building2 className={`w-5 h-5 ${settings.targetType === 'existing' ? 'text-white' : 'text-foreground-muted'
                                }`} />
                        </div>
                        <span className="font-semibold text-foreground">Add to Existing Campaign</span>
                    </div>
                    <p className="text-sm text-foreground-muted">
                        Publish ads into an active campaign
                    </p>
                </button>
            </div>

            {/* New Campaign Config */}
            {settings.targetType === 'new' && (
                <div className="space-y-4">
                    {/* ── Campaign Name Builder (elevated section) ── */}
                    <div className="p-4 rounded-xl bg-background-tertiary border border-cyan-500/20 border-l-2 border-l-cyan-500">
                        <div className="flex items-center gap-2 mb-1">
                            <Tag className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm font-semibold text-foreground">Campaign Name</span>
                        </div>
                        <p className="text-xs text-foreground-muted mb-4">
                            {hasTemplates ? 'Build your campaign name from your naming template' : 'Enter a name for your new campaign'}
                        </p>

                        {hasTemplates ? (
                            <div className="space-y-3">
                                {/* Template selector (if multiple) */}
                                {campaignTemplates.length > 1 && (
                                    <select
                                        value={campaignTemplateId}
                                        onChange={(e) => {
                                            setCampaignTemplateId(e.target.value);
                                            setCampaignTokenValues({});
                                        }}
                                        className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                                    >
                                        {campaignTemplates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Token input flow — inline chain with separators */}
                                <div className="flex flex-wrap items-end gap-1.5">
                                    {activeCampaignTemplate?.tokens.map((token, idx) => {
                                        const sep = activeCampaignTemplate.separator || '_';
                                        const showSep = idx < (activeCampaignTemplate?.tokens.length ?? 0) - 1;

                                        if (token.type === 'auto') {
                                            let autoValue = '';
                                            if (token.autoSource === 'date') {
                                                const d = new Date();
                                                autoValue = `${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getDate().toString().padStart(2, '0')}.${d.getFullYear()}`;
                                            } else if (token.autoSource === 'campaignType') {
                                                const ct = campaignTypes.find(c => c.id === settings.campaignType);
                                                autoValue = ct?.namingAlias || settings.campaignType || '—';
                                            }
                                            return (
                                                <React.Fragment key={token.id}>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-medium text-foreground-muted uppercase tracking-wider mb-0.5 px-1">{token.label}</span>
                                                        <div className="px-2.5 py-1.5 rounded-md bg-background border border-border text-foreground text-xs font-mono opacity-70 whitespace-nowrap">
                                                            {autoValue}
                                                        </div>
                                                    </div>
                                                    {showSep && <span className="text-foreground-muted font-mono text-sm pb-1.5 select-none">{sep}</span>}
                                                </React.Fragment>
                                            );
                                        }

                                        if (token.type === 'dropdown' && token.options && token.options.length > 0) {
                                            return (
                                                <React.Fragment key={token.id}>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-medium text-foreground-muted uppercase tracking-wider mb-0.5 px-1">{token.label}</span>
                                                        <select
                                                            value={campaignTokenValues[token.key] || ''}
                                                            onChange={(e) => setCampaignTokenValues(prev => ({ ...prev, [token.key]: e.target.value }))}
                                                            className="px-2 py-1.5 rounded-md bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-xs min-w-0"
                                                            style={{ maxWidth: '140px' }}
                                                        >
                                                            <option value="">{token.label}...</option>
                                                            {token.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    {showSep && <span className="text-foreground-muted font-mono text-sm pb-1.5 select-none">{sep}</span>}
                                                </React.Fragment>
                                            );
                                        }

                                        // Free text token
                                        return (
                                            <React.Fragment key={token.id}>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-medium text-foreground-muted uppercase tracking-wider mb-0.5 px-1">{token.label}</span>
                                                    <input
                                                        type="text"
                                                        value={campaignTokenValues[token.key] || ''}
                                                        onChange={(e) => setCampaignTokenValues(prev => ({ ...prev, [token.key]: e.target.value }))}
                                                        placeholder={token.label}
                                                        className="px-2 py-1.5 rounded-md bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-xs min-w-0"
                                                        style={{ width: '120px' }}
                                                    />
                                                </div>
                                                {showSep && <span className="text-foreground-muted font-mono text-sm pb-1.5 select-none">{sep}</span>}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Live assembled name preview */}
                                <div className={`px-3 py-2 rounded-lg font-mono text-xs border-2 transition-all ${assembledCampaignName
                                    ? 'bg-cyan-500/10 border-cyan-500/30 text-foreground shadow-[0_0_12px_rgba(6,182,212,0.08)]'
                                    : 'bg-background border-border text-foreground-muted italic'
                                    }`}>
                                    <span className="text-[9px] font-medium text-foreground-muted uppercase tracking-wider mr-2 font-sans">→</span>
                                    {assembledCampaignName || 'Fill in fields to preview...'}
                                </div>
                            </div>
                        ) : (
                            /* Fallback: plain text input */
                            <input
                                type="text"
                                value={settings.campaignName}
                                onChange={(e) => onUpdate({ campaignName: e.target.value })}
                                placeholder="Enter campaign name..."
                                className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground"
                            />
                        )}
                    </div>

                    {/* ── Campaign Settings (standard section) ── */}
                    <div className="space-y-4 p-4 rounded-xl bg-background-tertiary border border-border">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Campaign Type
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                {CAMPAIGN_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => onUpdate({
                                            campaignType: type.id,
                                            objective: type.id === 'ASC' ? 'OUTCOME_SALES' : settings.objective,
                                            optimizationGoal: type.id === 'ASC' ? 'OFFSITE_CONVERSIONS' : settings.optimizationGoal,
                                        })}
                                        className={`p-3 rounded-lg border text-left transition-all ${settings.campaignType === type.id
                                            ? 'border-cyan-500 bg-cyan-500/10'
                                            : 'border-border hover:border-border-hover bg-background'
                                            }`}
                                    >
                                        <span className={`block font-medium text-sm ${settings.campaignType === type.id ? 'text-cyan-500' : 'text-foreground'
                                            }`}>
                                            {type.label}
                                        </span>
                                        <span className="text-xs text-foreground-muted">
                                            {type.description}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Pixel Selector - Only shown for conversion-based objectives */}
                        {(settings.campaignType === 'ASC' || settings.objective === 'OUTCOME_SALES' || settings.objective === 'OUTCOME_LEADS') && (
                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Conversion Pixel
                                    <span className="text-xs text-amber-400">(Required)</span>
                                </label>
                                {isLoadingPixels ? (
                                    <div className="flex items-center gap-2 py-3 text-foreground-muted">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm">Loading pixels...</span>
                                    </div>
                                ) : pixels.length === 0 ? (
                                    <div className="py-2 space-y-1">
                                        <p className="text-sm text-amber-400">
                                            {error || 'No pixels found. Make sure you have a Meta Pixel configured for your ad account.'}
                                        </p>
                                        {error && (
                                            <p className="text-xs text-foreground-muted">
                                                Try disconnecting and reconnecting Meta in Settings → Connections
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <select
                                        value={settings.pixelId || ''}
                                        onChange={(e) => onUpdate({ pixelId: e.target.value || undefined })}
                                        className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground"
                                    >
                                        <option value="">Select a pixel...</option>
                                        {pixels.map((pixel) => (
                                            <option key={pixel.id} value={pixel.id}>
                                                {pixel.name} (•••{pixel.id.slice(-4)})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {settings.pixelId && (
                                    <p className="text-xs text-green-400 mt-1">
                                        ✓ Pixel selected for conversion tracking
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Existing Campaign Selection */}
            {settings.targetType === 'existing' && (
                <div className="space-y-4 p-4 rounded-xl bg-background-tertiary border border-border">
                    {/* Step indicator */}
                    <div className="flex items-center gap-3 pb-3 border-b border-border">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${settings.existingCampaignId ? 'bg-cyan-500 text-white' : 'bg-cyan-500 text-white'
                            }`}>
                            {settings.existingCampaignId ? '✓' : '1'}
                        </div>
                        <span className={`text-sm font-medium ${settings.existingCampaignId ? 'text-cyan-400' : 'text-foreground'}`}>
                            Select Campaign
                        </span>
                        <div className="h-px flex-1 bg-border" />
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${adSetChosen ? 'bg-cyan-500 text-white' : settings.existingCampaignId ? 'bg-cyan-500 text-white' : 'bg-background-tertiary text-foreground-muted border border-border'
                            }`}>
                            {adSetChosen ? '✓' : '2'}
                        </div>
                        <span className={`text-sm font-medium ${adSetChosen ? 'text-cyan-400' : settings.existingCampaignId ? 'text-foreground' : 'text-foreground-muted'}`}>
                            Choose Ad Set
                        </span>
                    </div>

                    {/* Campaign Selector */}
                    <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                            {settings.existingCampaignId ? (
                                <span className="text-cyan-400">✓ Campaign Selected</span>
                            ) : (
                                'Choose a campaign'
                            )}
                        </label>
                        <input
                            type="text"
                            value={campaignSearch}
                            onChange={(e) => setCampaignSearch(e.target.value)}
                            placeholder="Search campaigns..."
                            className="w-full px-4 py-2 mb-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                        />
                        {isLoadingCampaigns ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                            </div>
                        ) : (
                            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
                                {filteredCampaigns.length === 0 ? (
                                    <p className="p-4 text-sm text-foreground-muted text-center">
                                        No campaigns found
                                    </p>
                                ) : (
                                    filteredCampaigns.map((campaign) => (
                                        <button
                                            key={campaign.id}
                                            onClick={() => onUpdate({
                                                existingCampaignId: campaign.id,
                                                existingCampaignName: campaign.name,
                                                existingCampaignObjective: campaign.objective,
                                                existingCampaignIsCBO: !!(campaign.dailyBudget || campaign.lifetimeBudget),
                                                existingAdSetId: undefined,
                                                existingAdSetName: undefined,
                                            })}
                                            className={`w-full px-4 py-3 text-left border-b border-border last:border-b-0 transition-colors ${settings.existingCampaignId === campaign.id
                                                ? 'bg-cyan-500/10'
                                                : 'hover:bg-background-tertiary'
                                                }`}
                                        >
                                            <span className="block font-medium text-foreground text-sm">
                                                {campaign.name}
                                            </span>
                                            <span className="text-xs text-foreground-muted">
                                                {campaign.objective} • {campaign.status}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {/* Ad Set Section - Always visible when campaign selected */}
                    {settings.existingCampaignId && (
                        <div
                            ref={adSetSectionRef}
                            className={`pt-3 border-t border-border ${!adSetChosen ? 'animate-pulse' : ''}`}
                        >
                            {/* Ad set mode toggle */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <button
                                    onClick={() => onUpdate({ adSetMode: 'existing' })}
                                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${adSetMode === 'existing'
                                        ? 'border-cyan-500 bg-cyan-500/10 text-foreground'
                                        : 'border-border bg-background text-foreground-muted hover:border-border-hover'
                                        }`}
                                >
                                    Use Existing Ad Set
                                </button>
                                <button
                                    onClick={() => onUpdate({
                                        adSetMode: 'new',
                                        existingAdSetId: undefined,
                                        existingAdSetName: undefined,
                                        // Seed a sensible default name once
                                        ...(settings.newAdSetName ? {} : { newAdSetName: defaultNewAdSetName }),
                                    })}
                                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${adSetMode === 'new'
                                        ? 'border-cyan-500 bg-cyan-500/10 text-foreground'
                                        : 'border-border bg-background text-foreground-muted hover:border-border-hover'
                                        }`}
                                >
                                    Create New Ad Set
                                </button>
                            </div>

                            {adSetMode === 'existing' ? (
                                <>
                                    <label className="block text-sm font-medium text-foreground mb-2">
                                        Select Ad Set
                                    </label>
                                    <input
                                        type="text"
                                        value={adSetSearch}
                                        onChange={(e) => setAdSetSearch(e.target.value)}
                                        placeholder="Search ad sets..."
                                        className="w-full px-4 py-2 mb-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                                    />
                                    {isLoadingAdSets ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                                        </div>
                                    ) : (
                                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background">
                                            {filteredAdSets.length === 0 ? (
                                                <p className="p-4 text-sm text-foreground-muted text-center">
                                                    No ad sets found
                                                </p>
                                            ) : (
                                                filteredAdSets.map((adSet) => (
                                                    <button
                                                        key={adSet.id}
                                                        onClick={() => onUpdate({
                                                            existingAdSetId: adSet.id,
                                                            existingAdSetName: adSet.name,
                                                        })}
                                                        className={`w-full px-4 py-3 text-left border-b border-border last:border-b-0 transition-colors ${settings.existingAdSetId === adSet.id
                                                            ? 'bg-cyan-500/10'
                                                            : 'hover:bg-background-tertiary'
                                                            }`}
                                                    >
                                                        <span className="block font-medium text-foreground text-sm">
                                                            {adSet.name}
                                                        </span>
                                                        <span className="text-xs text-foreground-muted">
                                                            {adSet.status}
                                                        </span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-3">
                                    {/* New ad set name */}
                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-2">
                                            New Ad Set Name
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.newAdSetName || ''}
                                            onChange={(e) => onUpdate({ newAdSetName: e.target.value })}
                                            placeholder="e.g. Spring Launch - Jun 11"
                                            className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                                        />
                                    </div>

                                    {/* Budget: hidden for CBO campaigns */}
                                    {settings.existingCampaignIsCBO ? (
                                        <div className="flex items-start gap-2 p-3 rounded-lg bg-background border border-border">
                                            <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-xs text-foreground-muted">
                                                This campaign uses <span className="text-foreground font-medium">Campaign Budget Optimization</span> —
                                                Meta distributes budget across ad sets automatically, so the new ad set doesn&apos;t need its own.
                                            </p>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2">
                                                Daily Budget (USD)
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={settings.dailyBudget}
                                                onChange={(e) => onUpdate({ dailyBudget: parseFloat(e.target.value) || 0 })}
                                                className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                                            />
                                        </div>
                                    )}

                                    {/* Pixel: required when the campaign optimizes for conversions */}
                                    {needsPixelForNewAdSet && (
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                                                <Activity className="w-4 h-4" />
                                                Conversion Pixel
                                                <span className="text-xs text-amber-400">(Required)</span>
                                            </label>
                                            {isLoadingPixels ? (
                                                <div className="flex items-center gap-2 py-2 text-foreground-muted">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    <span className="text-sm">Loading pixels...</span>
                                                </div>
                                            ) : pixels.length === 0 ? (
                                                <p className="text-sm text-amber-400 py-1">
                                                    {error || 'No pixels found for this ad account.'}
                                                </p>
                                            ) : (
                                                <select
                                                    value={settings.pixelId || ''}
                                                    onChange={(e) => onUpdate({ pixelId: e.target.value || undefined })}
                                                    className="w-full px-4 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                                                >
                                                    <option value="">Select a pixel...</option>
                                                    {pixels.map((pixel) => (
                                                        <option key={pixel.id} value={pixel.id}>
                                                            {pixel.name} (•••{pixel.id.slice(-4)})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}

                                    <p className="text-xs text-foreground-subtle">
                                        Targeting and optimization match this campaign&apos;s objective
                                        ({settings.existingCampaignObjective?.replace('OUTCOME_', '').toLowerCase() || 'standard'}).
                                        The ad set is created paused.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
