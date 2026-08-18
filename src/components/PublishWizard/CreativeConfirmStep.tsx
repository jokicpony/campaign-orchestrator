'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Image as ImageIcon, Film, Link, ExternalLink } from 'lucide-react';
import { AdRow, CTA_OPTIONS, CallToAction, DEFAULT_AD_TYPES } from '@/types';
import { WizardSettings } from './index';

interface CreativeConfirmStepProps {
    settings: WizardSettings;
    selectedAds: AdRow[];
    onUpdate: (updates: Partial<WizardSettings>) => void;
}

export function CreativeConfirmStep({ settings, selectedAds, onUpdate }: CreativeConfirmStepProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    const toggleExpand = (rowId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return next;
        });
    };

    const getEffectiveUrl = (ad: AdRow): string => {
        return settings.adOverrides[ad.id]?.destinationUrl ?? ad.slots.destinationUrl ?? '';
    };

    const getEffectiveCta = (ad: AdRow): CallToAction => {
        return settings.adOverrides[ad.id]?.callToAction ?? ad.callToAction ?? 'LEARN_MORE';
    };

    const updateAdOverride = (adId: string, field: 'destinationUrl' | 'callToAction', value: string) => {
        const currentOverrides = settings.adOverrides;
        const currentAdOverride = currentOverrides[adId] || {};
        onUpdate({
            adOverrides: {
                ...currentOverrides,
                [adId]: {
                    ...currentAdOverride,
                    [field]: value,
                }
            }
        });
    };

    const getAssetCount = (ad: AdRow): number => ad.assets.length;
    const getCopyCount = (ad: AdRow): { pt: number; hl: number } => ({
        // Carousels publish only Primary Text 1
        pt: (ad.adType === 'carousel' ? ad.slots.primaryTexts.slice(0, 1) : ad.slots.primaryTexts).filter(Boolean).length,
        hl: ad.slots.headlines.filter(Boolean).length,
    });

    const getAdTypeLabel = (ad: AdRow): string =>
        DEFAULT_AD_TYPES.find(t => t.id === ad.adType)?.displayName || 'Unknown';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Confirm Creative Details</h3>
                <span className="text-sm text-foreground-muted">
                    {selectedAds.length} ad{selectedAds.length !== 1 ? 's' : ''} selected
                </span>
            </div>

            <p className="text-sm text-foreground-muted">
                Review and make any last-minute changes to URLs or CTAs before publishing.
            </p>

            {/* Ad List */}
            <div className="space-y-3">
                {selectedAds.map((ad) => {
                    const isExpanded = expandedRows.has(ad.id);
                    const assetCount = getAssetCount(ad);
                    const copyCount = getCopyCount(ad);
                    const displayedAsset = ad.assets[0];

                    return (
                        <div
                            key={ad.id}
                            className="rounded-xl border border-border bg-background-tertiary overflow-hidden"
                        >
                            {/* Collapsed Row */}
                            <div className="flex items-center gap-4 p-4">
                                {/* Thumbnail */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-background flex-shrink-0">
                                    {displayedAsset?.permanentThumbnailUrl || displayedAsset?.cachedThumbnail || displayedAsset?.thumbnailUrl ? (
                                        <img
                                            src={displayedAsset.permanentThumbnailUrl || displayedAsset.cachedThumbnail || displayedAsset.thumbnailUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : displayedAsset?.type === 'video' ? (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Film className="w-5 h-5 text-foreground-muted" />
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageIcon className="w-5 h-5 text-foreground-muted" />
                                        </div>
                                    )}
                                </div>

                                {/* Ad Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">
                                        {ad.generatedAdName || ad.angleName || `Ad ${ad.id.slice(0, 6)}`}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-foreground-muted">
                                        <span className="px-1.5 py-0.5 rounded bg-background">
                                            {getAdTypeLabel(ad)}
                                        </span>
                                        <span>{assetCount} asset{assetCount !== 1 ? 's' : ''}</span>
                                        <span>•</span>
                                        <span>{copyCount.pt} PT, {copyCount.hl} HL</span>
                                    </div>
                                </div>

                                {/* URL Display with hover and test link */}
                                <div className="hidden sm:flex items-center gap-2 text-sm text-foreground-muted max-w-48 group relative">
                                    <Link className="w-4 h-4 flex-shrink-0" />
                                    <span className="truncate" title={getEffectiveUrl(ad) || 'No URL set'}>
                                        {getEffectiveUrl(ad) || 'No URL'}
                                    </span>
                                    {getEffectiveUrl(ad) && (
                                        <a
                                            href={getEffectiveUrl(ad)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1 rounded hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Test link in new tab"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-cyan-500" />
                                        </a>
                                    )}
                                </div>

                                {/* CTA Badge */}
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-500">
                                    {CTA_OPTIONS.find(c => c.id === getEffectiveCta(ad))?.label || 'Learn More'}
                                </span>

                                {/* Expand Toggle */}
                                <button
                                    onClick={() => toggleExpand(ad.id)}
                                    className="p-2 rounded-lg hover:bg-background transition-colors"
                                >
                                    {isExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-foreground-muted" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-foreground-muted" />
                                    )}
                                </button>
                            </div>

                            {/* Expanded Details */}
                            {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-border space-y-4">
                                    {/* URL Override */}
                                    <div>
                                        <label className="block text-xs font-medium text-foreground-muted mb-1">
                                            Destination URL
                                        </label>
                                        <input
                                            type="url"
                                            value={getEffectiveUrl(ad)}
                                            onChange={(e) => updateAdOverride(ad.id, 'destinationUrl', e.target.value)}
                                            placeholder="https://..."
                                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-sm text-foreground"
                                        />
                                    </div>

                                    {/* CTA Override */}
                                    <div>
                                        <label className="block text-xs font-medium text-foreground-muted mb-1">
                                            Call to Action
                                        </label>
                                        <select
                                            value={getEffectiveCta(ad)}
                                            onChange={(e) => updateAdOverride(ad.id, 'callToAction', e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-cyan-500 focus:outline-none text-sm text-foreground"
                                        >
                                            {CTA_OPTIONS.map((cta) => (
                                                <option key={cta.id} value={cta.id}>
                                                    {cta.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Assets Preview */}
                                    {ad.assets.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-medium text-foreground-muted mb-2">
                                                Assets ({ad.assets.length})
                                            </label>
                                            <div className="flex gap-2 overflow-x-auto pb-2">
                                                {ad.assets.map((asset, idx) => (
                                                    <div
                                                        key={asset.id || idx}
                                                        className="w-16 h-16 rounded-lg overflow-hidden bg-background flex-shrink-0 border border-border"
                                                    >
                                                        {asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl ? (
                                                            <img
                                                                src={asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                {asset.type === 'video' ? (
                                                                    <Film className="w-4 h-4 text-foreground-muted" />
                                                                ) : (
                                                                    <ImageIcon className="w-4 h-4 text-foreground-muted" />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Copy Preview */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-foreground-muted mb-1">
                                                Primary Texts ({copyCount.pt})
                                            </label>
                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                                {(ad.adType === 'carousel' ? ad.slots.primaryTexts.slice(0, 1) : ad.slots.primaryTexts).filter(Boolean).map((slot, idx) => (
                                                    <p key={idx} className="text-xs text-foreground bg-background p-2 rounded truncate">
                                                        {slot?.localText || slot?.masterItem.text}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-foreground-muted mb-1">
                                                Headlines ({copyCount.hl})
                                            </label>
                                            <div className="space-y-1 max-h-24 overflow-y-auto">
                                                {/* Carousel headlines are positional (Card N = Headline N) — keep gaps visible */}
                                                {(ad.adType === 'carousel'
                                                    ? ad.slots.headlines.slice(0, ad.assets.length)
                                                    : ad.slots.headlines.filter(Boolean)
                                                ).map((slot, idx) => (
                                                    <p key={idx} className="text-xs text-foreground bg-background p-2 rounded truncate">
                                                        {ad.adType === 'carousel' && <span className="text-foreground-muted">Card {idx + 1}: </span>}
                                                        {slot ? (slot.localText || slot.masterItem.text) : <span className="italic text-foreground-muted">no headline</span>}
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
