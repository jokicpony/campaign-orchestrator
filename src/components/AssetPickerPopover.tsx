'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Video, ImageOff, Loader2 } from 'lucide-react';
import { Asset } from '@/types';
import { shapeLabel } from '@/lib/meta/multiMedia';


interface AssetPickerPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectAssets: (assets: Asset[]) => void;
    currentAssets: Asset[];
    cachedAssets: Asset[];
    usedAssetCounts?: Record<string, number>;
    maxSelection?: number; // Optional limit on number of assets
    onRefreshAssets?: () => void; // Callback to trigger asset reload after reconnect
    hasFolderConfigured?: boolean; // Whether a Drive folder URL has been set up
    isLoading?: boolean; // Whether assets are currently being loaded
}

/**
 * Simplified asset picker popover that shows pre-loaded assets.
 * Folder config is now handled at the campaign level via DriveFolderConfig.
 */
export function AssetPickerPopover({
    isOpen,
    onClose,
    onSelectAssets,
    currentAssets,
    cachedAssets,
    usedAssetCounts = {},
    maxSelection,
    hasFolderConfigured = false,
    isLoading = false,
}: AssetPickerPopoverProps) {
    const popoverRef = useRef<HTMLDivElement>(null);



    const [selectedIds, setSelectedIds] = useState<Set<string>>(
        new Set(currentAssets.map(a => a.id))
    );

    // Sync selected IDs when current assets change (state adjustment during
    // render — avoids the cascading render of a setState-in-effect)
    const [prevAssets, setPrevAssets] = useState(currentAssets);
    if (currentAssets !== prevAssets) {
        setPrevAssets(currentAssets);
        setSelectedIds(new Set(currentAssets.map(a => a.id)));
    }

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    // Sort assets: unused first, then by use count (ascending)
    const sortedAssets = useMemo(() => {
        return [...cachedAssets].sort((a, b) => {
            const countA = usedAssetCounts[a.id] || 0;
            const countB = usedAssetCounts[b.id] || 0;
            return countA - countB;
        });
    }, [cachedAssets, usedAssetCounts]);

    const toggleAsset = useCallback((asset: Asset) => {
        setSelectedIds(prev => {
            const updated = new Set(prev);
            if (updated.has(asset.id)) {
                updated.delete(asset.id);
            } else {
                // Check if limit reached
                if (maxSelection && updated.size >= maxSelection) {
                    return prev; // Block selection
                }
                updated.add(asset.id);
            }
            return updated;
        });
    }, [maxSelection]);

    // Order matters (carousel cards pair with headlines by position; the first
    // multi-media asset is the ad's lead media). selectedIds is a Set, which
    // keeps insertion order: the row's existing assets first, then new picks
    // in click order. Row assets missing from the library cache are kept as-is.
    const handleConfirm = useCallback(() => {
        const byId = new Map(cachedAssets.map(a => [a.id, a]));
        const current = new Map(currentAssets.map(a => [a.id, a]));
        const selectedAssets = Array.from(selectedIds)
            .map(id => byId.get(id) ?? current.get(id))
            .filter((a): a is Asset => !!a);
        onSelectAssets(selectedAssets);
        onClose();
    }, [cachedAssets, currentAssets, selectedIds, onSelectAssets, onClose]);

    const hasAssets = cachedAssets.length > 0;

    if (!isOpen) return null;

    const isAtLimit = maxSelection && selectedIds.size >= maxSelection;

    return (
        <AnimatePresence>
            <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute left-full top-0 ml-2 w-[520px] bg-surface-secondary border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div className="flex flex-col">
                        <span className="font-medium text-sm">Select Assets</span>
                        {maxSelection && (
                            <span className={`text-[10px] uppercase tracking-wider ${isAtLimit ? 'text-accent-primary font-bold' : 'text-foreground-muted'}`}>
                                {selectedIds.size} / {maxSelection} Max Assets
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-foreground-muted" />
                    </button>
                </div>

                {/* Asset Grid */}
                {hasAssets ? (
                    <div className="p-4 max-h-80 overflow-y-auto">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-foreground-muted">
                                {selectedIds.size} selected
                            </span>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                            {sortedAssets.map((asset) => {
                                const isSelected = selectedIds.has(asset.id);
                                const useCount = usedAssetCounts[asset.id] || 0;
                                const isUsed = useCount > 0;

                                return (
                                    <button
                                        key={asset.id}
                                        onClick={() => toggleAsset(asset)}
                                        className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${isSelected
                                            ? 'border-accent-primary ring-2 ring-accent-primary/30'
                                            : 'border-transparent hover:border-white/20'
                                            }`}
                                    >
                                        {/* Image wrapper with conditional dimming */}
                                        <div className={`absolute inset-0 transition-all ${isUsed && !isSelected
                                            ? 'opacity-40 grayscale-[50%] group-hover:opacity-100 group-hover:grayscale-0'
                                            : ''
                                            }`}>
                                            {/* Thumbnail - prefer cachedThumbnail */}
                                            {(asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl) ? (
                                                <img
                                                    src={asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl}
                                                    alt={asset.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-surface-tertiary flex items-center justify-center">
                                                    {asset.type === 'video' ? (
                                                        <Video className="w-8 h-8 text-foreground-muted" />
                                                    ) : (
                                                        <ImageIcon className="w-8 h-8 text-foreground-muted" />
                                                    )}
                                                </div>
                                            )}

                                            {/* Badge row: Type + Orientation */}
                                            <div className="absolute bottom-1 left-1 flex gap-1 items-center">
                                                {asset.type === 'video' ? (
                                                    <Video className="w-3.5 h-3.5 text-white drop-shadow" />
                                                ) : (
                                                    <ImageIcon className="w-3.5 h-3.5 text-white drop-shadow" />
                                                )}
                                                {shapeLabel(asset.dimensions) && (
                                                    <span className="text-[9px] font-bold text-white drop-shadow bg-black/40 px-1 rounded">
                                                        {shapeLabel(asset.dimensions)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Selection indicator - above dimming layer */}
                                        {/* Number = position in the row (order matters for carousels and the multi-media lead) */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-accent-primary/30 flex items-center justify-center">
                                                <span className="w-7 h-7 rounded-full bg-accent-primary flex items-center justify-center text-xs font-bold text-white shadow">
                                                    {Array.from(selectedIds).indexOf(asset.id) + 1}
                                                </span>
                                            </div>
                                        )}

                                        {/* Used count badge - OUTSIDE dimming, always full opacity */}
                                        {isUsed && !isSelected && (
                                            <div className="absolute top-1 right-1 min-w-5 h-5 px-1.5 rounded-full bg-foreground-subtle flex items-center justify-center shadow-lg z-10">
                                                <span className="text-[10px] font-bold text-white">{useCount}</span>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="p-8 text-center">
                        {/* Loading state - show spinner */}
                        {isLoading ? (
                            <>
                                <Loader2 className="w-10 h-10 text-cyan-500 mx-auto mb-3 animate-spin" />
                                <p className="text-sm text-foreground-muted mb-1">Loading assets...</p>
                                <p className="text-xs text-foreground-subtle">
                                    Fetching from Google Drive
                                </p>
                            </>
                        ) : !hasFolderConfigured ? (
                            /* No folder configured - direct to Assets tab */
                            <>
                                <ImageOff className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
                                <p className="text-sm text-foreground-muted mb-2">No folder configured</p>
                                <p className="text-xs text-foreground-subtle">
                                    Go to the <span className="text-cyan-400 font-medium">Assets</span> tab to connect a Google Drive folder
                                </p>
                            </>
                        ) : (
                            /* Folder configured but assets not loaded - guide to Assets tab */
                            <>
                                <ImageOff className="w-10 h-10 text-foreground-subtle mx-auto mb-3" />
                                <p className="text-sm text-foreground-muted mb-2">Assets not loaded</p>
                                <p className="text-xs text-foreground-subtle">
                                    Go to the <span className="text-cyan-400 font-medium">Assets</span> tab to load your campaign assets
                                </p>
                            </>
                        )}
                    </div>
                )}

                {/* Confirm Button */}
                {hasAssets && (
                    <div className="p-4 border-t border-white/5">
                        <button
                            onClick={handleConfirm}
                            className="w-full py-2.5 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-white font-medium text-sm transition-colors"
                        >
                            Add {selectedIds.size} Asset{selectedIds.size !== 1 ? 's' : ''}
                        </button>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
