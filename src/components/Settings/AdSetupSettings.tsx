'use client';

import React, { useState } from 'react';
import { ChevronDown, Layers, Tag, Link2, Megaphone, Users } from 'lucide-react';
import { GlobalPromptSettings } from '@/types';
import { AdTypesSettings } from './AdTypesSettings';
import { NamingSettings } from './NamingSettings';
import { CampaignNamingSettings } from './CampaignNamingSettings';

interface AdSetupSettingsProps {
    settings: GlobalPromptSettings;
    onChange: (updates: Partial<GlobalPromptSettings>) => void;
}

interface SectionProps {
    title: string;
    icon: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function CollapsibleSection({ title, icon, isOpen, onToggle, children }: SectionProps) {
    return (
        <div className="border border-border rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 bg-background-tertiary/50 hover:bg-background-tertiary transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className="text-foreground-muted">{icon}</span>
                    <span className="text-sm font-semibold text-foreground">{title}</span>
                </div>
                <ChevronDown
                    className={`w-4 h-4 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen && (
                <div className="p-4 border-t border-border bg-background">
                    {children}
                </div>
            )}
        </div>
    );
}

export function AdSetupSettings({ settings, onChange }: AdSetupSettingsProps) {
    const [openSection, setOpenSection] = useState<'adtypes' | 'audience' | 'naming' | 'campaignNaming' | 'urlparams' | null>(null);

    const toggleSection = (section: 'adtypes' | 'audience' | 'naming' | 'campaignNaming' | 'urlparams') => {
        setOpenSection(openSection === section ? null : section);
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Ad Setup</h2>
                <p className="text-sm text-foreground-muted">
                    Configure ad types, naming conventions, and tracking for your campaigns
                </p>
            </div>

            <div className="space-y-3">
                {/* Ad Types Section */}
                <CollapsibleSection
                    title="Ad Types"
                    icon={<Layers className="w-4 h-4" />}
                    isOpen={openSection === 'adtypes'}
                    onToggle={() => toggleSection('adtypes')}
                >
                    <AdTypesSettings settings={settings} onChange={onChange} />
                </CollapsibleSection>

                {/* Audience Defaults Section */}
                <CollapsibleSection
                    title="Audience Defaults"
                    icon={<Users className="w-4 h-4" />}
                    isOpen={openSection === 'audience'}
                    onToggle={() => toggleSection('audience')}
                >
                    <div className="space-y-4">
                        <p className="text-sm text-foreground-muted">
                            Defaults applied to the audience of every ad set you publish.
                            You can still adjust targeting per campaign in Ads Manager afterward.
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                Minimum audience age
                            </label>
                            <input
                                type="number"
                                min={13}
                                max={65}
                                value={settings.defaultAgeMin ?? 21}
                                onChange={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    onChange({ defaultAgeMin: Number.isFinite(n) ? n : undefined });
                                }}
                                onBlur={(e) => {
                                    const n = parseInt(e.target.value, 10);
                                    if (Number.isFinite(n)) onChange({ defaultAgeMin: Math.min(65, Math.max(13, n)) });
                                }}
                                className="w-28 px-3 py-2 rounded-lg bg-background-tertiary border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm"
                            />
                            <p className="mt-2 text-xs text-foreground-muted">
                                Applied to every published ad set (Meta allows 13–65). Automatically
                                omitted for Special Ad Categories, which forbid age targeting.
                                Regulated verticals such as alcohol use <strong>21</strong>.
                            </p>
                        </div>
                    </div>
                </CollapsibleSection>

                {/* Ad Naming Convention Section */}
                <CollapsibleSection
                    title="Ad Naming Conventions"
                    icon={<Tag className="w-4 h-4" />}
                    isOpen={openSection === 'naming'}
                    onToggle={() => toggleSection('naming')}
                >
                    <NamingSettings settings={settings} onChange={onChange} />
                </CollapsibleSection>

                {/* Campaign Naming Convention Section */}
                <CollapsibleSection
                    title="Campaign Naming Conventions"
                    icon={<Megaphone className="w-4 h-4" />}
                    isOpen={openSection === 'campaignNaming'}
                    onToggle={() => toggleSection('campaignNaming')}
                >
                    <CampaignNamingSettings settings={settings} onChange={onChange} />
                </CollapsibleSection>

                {/* URL Parameters Section */}
                <CollapsibleSection
                    title="URL Parameters"
                    icon={<Link2 className="w-4 h-4" />}
                    isOpen={openSection === 'urlparams'}
                    onToggle={() => toggleSection('urlparams')}
                >
                    <div className="space-y-4">
                        <p className="text-sm text-foreground-muted">
                            Add tracking parameters that will be appended to all destination URLs during publishing.
                            Meta supports dynamic parameters like <code className="px-1 py-0.5 rounded bg-background-tertiary text-cyan-400">{'{{campaign.name}}'}</code> and <code className="px-1 py-0.5 rounded bg-background-tertiary text-cyan-400">{'{{ad.name}}'}</code>.
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-foreground mb-2">
                                URL Parameters
                            </label>
                            <textarea
                                value={settings.urlParameters || ''}
                                onChange={(e) => onChange({ urlParameters: e.target.value })}
                                placeholder="utm_source={{site_source_name}}&utm_medium=paidsoc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"
                                className="w-full px-4 py-3 rounded-lg bg-background-tertiary border border-border focus:border-cyan-500 focus:outline-none text-foreground text-sm font-mono resize-y min-h-[80px]"
                            />
                            <p className="mt-2 text-xs text-foreground-muted">
                                Enter without the leading <code className="px-1 py-0.5 rounded bg-background-tertiary">?</code> — it will be added automatically.
                            </p>
                        </div>

                        {settings.urlParameters && (
                            <div className="p-3 rounded-lg bg-background-tertiary/50 border border-border">
                                <p className="text-xs font-medium text-foreground-muted mb-1">Preview:</p>
                                <p className="text-sm text-foreground font-mono break-all">
                                    ?{settings.urlParameters}
                                </p>
                            </div>
                        )}

                        {/* Dynamic Parameters Reference */}
                        <div className="border border-border rounded-lg overflow-hidden">
                            <div className="px-3 py-2 bg-background-tertiary/50 border-b border-border">
                                <p className="text-xs font-semibold text-foreground">Available Dynamic Parameters</p>
                            </div>
                            <div className="p-3 space-y-3 text-xs">
                                {/* Campaign Level */}
                                <div>
                                    <p className="font-medium text-foreground-muted mb-1">Campaign</p>
                                    <div className="grid gap-1">
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{campaign.id}}'}</code>
                                            <span className="text-foreground-muted">Unique campaign ID</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{campaign.name}}'}</code>
                                            <span className="text-foreground-muted">Campaign name</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Ad Set Level */}
                                <div>
                                    <p className="font-medium text-foreground-muted mb-1">Ad Set</p>
                                    <div className="grid gap-1">
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{adset.id}}'}</code>
                                            <span className="text-foreground-muted">Unique ad set ID</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{adset.name}}'}</code>
                                            <span className="text-foreground-muted">Ad set name</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Ad Level */}
                                <div>
                                    <p className="font-medium text-foreground-muted mb-1">Ad</p>
                                    <div className="grid gap-1">
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{ad.id}}'}</code>
                                            <span className="text-foreground-muted">Unique ad ID</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{ad.name}}'}</code>
                                            <span className="text-foreground-muted">Ad name</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Placement & Source */}
                                <div>
                                    <p className="font-medium text-foreground-muted mb-1">Placement & Source</p>
                                    <div className="grid gap-1">
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{site_source_name}}'}</code>
                                            <span className="text-foreground-muted">Platform: fb, ig, msg, an</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <code className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono whitespace-nowrap">{'{{placement}}'}</code>
                                            <span className="text-foreground-muted">E.g. Facebook_Desktop_Feed</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleSection>
            </div>
        </div>
    );
}
