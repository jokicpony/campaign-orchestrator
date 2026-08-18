'use client';

import React from 'react';
import { GlobalPromptSettings, AdTypeConfig, DEFAULT_AD_TYPES, AD_TYPE_COLORS, mergeAdTypes } from '@/types';

interface AdTypesSettingsProps {
    settings: GlobalPromptSettings;
    onChange: (updates: Partial<GlobalPromptSettings>) => void;
}

export function AdTypesSettings({ settings, onChange }: AdTypesSettingsProps) {
    const adTypes = mergeAdTypes(settings.adTypes);

    const handleUpdateAdType = (id: string, updates: Partial<AdTypeConfig>) => {
        const updated = adTypes.map(t =>
            t.id === id ? { ...t, ...updates } : t
        );
        onChange({ adTypes: updated });
    };

    const handleResetToDefaults = () => {
        onChange({ adTypes: [...DEFAULT_AD_TYPES] });
    };

    // Resolve a type's declared color (badge sites key off the same field)
    const getTypeColor = (adType: AdTypeConfig) => {
        return AD_TYPE_COLORS.find(c => c.id === adType.color) || AD_TYPE_COLORS[0];
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Ad Types</h3>
                    <p className="text-xs text-foreground-muted mt-0.5">
                        Configure naming aliases for standardized ad types
                    </p>
                </div>
                <button
                    onClick={handleResetToDefaults}
                    className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                >
                    Reset to defaults
                </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[32px_1fr_120px_1fr] gap-3 px-2 text-xs font-medium text-foreground-subtle uppercase tracking-wider">
                <span></span>
                <span>Type Name</span>
                <span>Naming Alias</span>
                <span>Description</span>
            </div>

            {/* Ad type rows */}
            <div className="space-y-2">
                {adTypes.map((adType) => {
                    const color = getTypeColor(adType);
                    return (
                        <div
                            key={adType.id}
                            className="grid grid-cols-[32px_1fr_120px_1fr] gap-3 items-center p-2 rounded-lg bg-background-tertiary/50 border border-border/50 hover:border-border transition-colors"
                        >
                            {/* Color indicator */}
                            <div
                                className={`w-5 h-5 rounded-full ${color.class}`}
                                title={`Color: ${color.label}`}
                            />

                            {/* Display Name (Read-only) */}
                            <div className="px-2 py-1.5 text-sm font-medium text-foreground">
                                {adType.displayName}
                            </div>

                            {/* Naming Alias */}
                            <input
                                type="text"
                                value={adType.namingAlias}
                                onChange={(e) => handleUpdateAdType(adType.id, { namingAlias: e.target.value })}
                                placeholder="Alias..."
                                className="px-2 py-1.5 text-sm font-mono rounded bg-background border border-border focus:border-accent-primary focus:outline-none"
                            />

                            {/* Description (Read-only for core types, or we can allow edit) */}
                            <input
                                type="text"
                                value={adType.description || ''}
                                onChange={(e) => handleUpdateAdType(adType.id, { description: e.target.value })}
                                placeholder="Optional description..."
                                className="px-2 py-1.5 text-sm rounded bg-background border border-border focus:border-accent-primary focus:outline-none text-foreground-muted"
                            />
                        </div>
                    );
                })}
            </div>

            {/* Add new type button REMOVED */}

            {/* Preview */}
            <div className="p-3 rounded-lg bg-background border border-border/50 mt-4">
                <span className="text-xs font-medium text-foreground-subtle uppercase tracking-wider">Preview</span>
                <div className="mt-2 flex flex-wrap gap-2">
                    {adTypes.map((adType) => {
                        const color = getTypeColor(adType);
                        return (
                            <span
                                key={adType.id}
                                className={`px-2 py-1 text-xs font-medium rounded-full ${color.class} text-white`}
                            >
                                {adType.displayName}
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
