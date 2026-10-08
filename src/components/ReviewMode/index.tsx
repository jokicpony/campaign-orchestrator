'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, MessageSquare, AlertCircle, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Send, X, Link2, Copy, Check, Grid3X3, ChevronDown, Upload, Square, CheckSquare, CloudOff } from 'lucide-react';
import { Campaign, AdRow, AdComment, DEFAULT_AD_TYPES, mergeAdTypes, AD_TYPE_COLORS } from '@/types';
import { useAuth } from '@/components/AuthContext';
import { CarouselPairingHint } from '@/components/CarouselPairingHint';
import { MediaStacks } from '@/components/MediaStacks';
import { shapeLabel } from '@/lib/meta/multiMedia';
import { PublishWizard, WizardSettings, AdPublishResult } from '@/components/PublishWizard';

interface ReviewModeProps {
    campaign: Campaign;
    onUpdateRow: (rowId: string, updates: Partial<AdRow>) => void;
    globalSettings?: {
        adTypes?: typeof DEFAULT_AD_TYPES;
    };
}

// Priority sort: builder responded (needs reviewer attention) > pending > reviewed
function getRowPriority(row: AdRow): number {
    const comments = row.comments || [];
    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
    const lastCommentFromBuilder = lastComment?.author === 'builder';

    if (lastCommentFromBuilder && row.reviewStatus !== 'reviewed') return 0; // Highest priority
    if (row.reviewStatus === 'reviewed') return 2; // Lowest priority
    return 1; // Pending/needs changes in middle
}

export function ReviewMode({ campaign, onUpdateRow, globalSettings }: ReviewModeProps) {
    const { user, driveAccessToken } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showOverview, setShowOverview] = useState(false);
    const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
    const [showPublishWizard, setShowPublishWizard] = useState(false);

    // Sort rows by priority
    const sortedRows = useMemo(() => {
        return [...campaign.rows].sort((a, b) => getRowPriority(a) - getRowPriority(b));
    }, [campaign.rows]);

    const rows = sortedRows;
    const totalRows = rows.length;
    const currentRow = rows[currentIndex];

    // Count review statuses
    const reviewedCount = rows.filter(r => r.reviewStatus === 'reviewed').length;
    const builderRespondedCount = rows.filter(r => {
        const comments = r.comments || [];
        const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
        return lastComment?.author === 'builder' && r.reviewStatus !== 'reviewed';
    }).length;
    const pendingCount = totalRows - reviewedCount;

    // Get reviewed rows for selection
    const reviewedRows = useMemo(() => rows.filter(r => r.reviewStatus === 'reviewed'), [rows]);
    const selectedAds = useMemo(() =>
        rows.filter(r => selectedRowIds.has(r.id)),
        [rows, selectedRowIds]
    );

    // Selection handlers
    const toggleRowSelection = useCallback((rowId: string) => {
        setSelectedRowIds(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return next;
        });
    }, []);

    const selectAllReviewed = useCallback(() => {
        setSelectedRowIds(new Set(reviewedRows.map(r => r.id)));
    }, [reviewedRows]);

    const clearSelection = useCallback(() => {
        setSelectedRowIds(new Set());
    }, []);

    // Placeholder publish handler (legacy - actual API calls now happen inside PublishWizard)
    const handlePublish = useCallback(async (
        settings: WizardSettings,
        adsToPublish: AdRow[]
    ): Promise<AdPublishResult[]> => {
        console.log('handlePublish called (legacy mock):', adsToPublish.map(a => a.id));
        // Return empty - actual publishing happens in PublishWizard
        return [];
    }, []);

    // Called by PublishWizard AFTER successful API publish
    // IMPORTANT: Batch all row updates into a single onUpdateRow call to avoid race conditions
    // where sequential calls use stale state and overwrite each other
    const handlePublishComplete = useCallback((results: AdPublishResult[]) => {
        console.log('========================================');
        console.log('handlePublishComplete called with results:', results);
        const now = new Date().toISOString();

        // Collect all successful updates into a map
        const rowUpdates: Record<string, { lastPublishedAt: string; metaAdId?: string }> = {};
        results.forEach(result => {
            console.log(`Ad ${result.rowId}: success=${result.success}, error=${result.error || 'none'}`);
            if (result.success) {
                rowUpdates[result.rowId] = {
                    lastPublishedAt: now,
                    metaAdId: result.metaAdId
                };
            }
        });

        // Apply all updates by calling onUpdateRow for each (but sequentially with proper logging)
        // The real fix would be a batch update function, but for now we iterate
        Object.entries(rowUpdates).forEach(([rowId, updates]) => {
            console.log(`Updating row ${rowId} with lastPublishedAt: ${now}`);
            onUpdateRow(rowId, updates);
        });

        console.log('========================================');
    }, [onUpdateRow]);

    // Navigation handlers
    const goToPrev = useCallback(() => {
        setCurrentIndex(prev => (prev - 1 + totalRows) % totalRows);
    }, [totalRows]);

    const goToNext = useCallback(() => {
        setCurrentIndex(prev => (prev + 1) % totalRows);
    }, [totalRows]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrev();
            if (e.key === 'ArrowRight') goToNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrev, goToNext]);

    // Auto-advance after marking reviewed
    const handleUpdateRow = useCallback((rowId: string, updates: Partial<AdRow>) => {
        onUpdateRow(rowId, updates);
        // If marking as reviewed, auto-advance after a short delay
        if (updates.reviewStatus === 'reviewed' && currentIndex < totalRows - 1) {
            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
            }, 400);
        }
    }, [onUpdateRow, currentIndex, totalRows]);

    // Keep index in bounds if rows change (state adjustment during render)
    if (currentIndex >= totalRows && totalRows > 0) {
        setCurrentIndex(totalRows - 1);
    }

    if (totalRows === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-foreground-muted text-lg">No ads to review</p>
                    <p className="text-foreground-subtle text-sm mt-2">
                        Switch to Build Mode to create ads
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background-secondary flex-shrink-0">
                <div className="flex items-center gap-4 text-sm">
                    {builderRespondedCount > 0 && (
                        <span className="flex items-center gap-1.5 text-purple-400">
                            <MessageSquare className="w-4 h-4" />
                            {builderRespondedCount} need response
                        </span>
                    )}
                    <span className="flex items-center gap-1.5 text-accent-success">
                        <CheckCircle2 className="w-4 h-4" />
                        {reviewedCount} reviewed
                    </span>
                    <span className="text-foreground-muted">
                        {pendingCount} pending
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowOverview(!showOverview)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${showOverview
                            ? 'bg-accent-primary text-white'
                            : 'bg-background-tertiary text-foreground hover:bg-background-secondary'
                            }`}
                    >
                        <Grid3X3 className="w-4 h-4" />
                        Overview
                        <ChevronDown className={`w-4 h-4 transition-transform ${showOverview ? 'rotate-180' : ''}`} />
                    </button>
                    <span className="text-sm font-medium text-foreground">
                        Ad {currentIndex + 1} of {totalRows}
                    </span>
                </div>
            </div>

            {/* Thumbnail Overview Dropdown */}
            <AnimatePresence>
                {showOverview && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-b border-border bg-background-secondary"
                    >
                        <div className="p-6">
                            {/* Selection controls */}
                            {reviewedCount > 0 && (
                                <div className="flex items-center gap-4 mb-4">
                                    <button
                                        onClick={selectAllReviewed}
                                        className="text-sm text-accent-primary hover:underline"
                                    >
                                        Select all reviewed ({reviewedCount})
                                    </button>
                                    {selectedRowIds.size > 0 && (
                                        <button
                                            onClick={clearSelection}
                                            className="text-sm text-foreground-muted hover:text-foreground"
                                        >
                                            Clear selection
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="grid grid-cols-8 gap-4 max-h-72 overflow-y-auto overflow-x-visible py-2 px-2">
                                {rows.map((row, idx) => {
                                    const asset = row.assets[0];
                                    const isReviewed = row.reviewStatus === 'reviewed';
                                    const comments = row.comments || [];
                                    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
                                    const lastFromBuilder = lastComment?.author === 'builder';
                                    const needsChanges = row.reviewStatus === 'needs_changes';
                                    const isCurrent = idx === currentIndex;
                                    const isPending = !isReviewed && !needsChanges && !lastFromBuilder;
                                    const isSelected = selectedRowIds.has(row.id);

                                    // Ad type badge config
                                    const adTypesConfig = mergeAdTypes(globalSettings?.adTypes);
                                    const currentTypeIndex = adTypesConfig.findIndex(t => t.id === row.adType);
                                    const currentType = currentTypeIndex >= 0 ? adTypesConfig[currentTypeIndex] : null;
                                    const adTypeLabel = currentType?.displayName || row.adType || '';
                                    const badgeColors = [
                                        'bg-blue-500/90', 'bg-emerald-500/90', 'bg-purple-500/90', 'bg-pink-500/90',
                                        'bg-amber-500/90', 'bg-cyan-500/90', 'bg-rose-500/90', 'bg-indigo-500/90',
                                    ];
                                    const badgeBg = currentType
                                        ? badgeColors[Math.max(AD_TYPE_COLORS.findIndex(c => c.id === currentType.color), 0)]
                                        : 'bg-gray-500/90';

                                    return (
                                        <div
                                            key={row.id}
                                            className={`relative rounded-md overflow-visible border-[3px] transition-all origin-center aspect-[4/3] ${isCurrent
                                                ? 'scale-[1.08] shadow-lg shadow-white/25 z-10 ring-2 ring-white/30'
                                                : 'hover:scale-105'
                                                } ${isSelected
                                                    ? 'border-cyan-400 ring-2 ring-cyan-400/50'
                                                    : isReviewed
                                                        ? 'border-accent-success'
                                                        : lastFromBuilder
                                                            ? 'border-purple-500'
                                                            : needsChanges
                                                                ? 'border-amber-500'
                                                                : 'border-foreground-subtle/40 hover:border-foreground-muted'
                                                }`}
                                        >
                                            {/* Click overlay for navigation */}
                                            <button
                                                onClick={() => setCurrentIndex(idx)}
                                                className="absolute inset-0 z-10"
                                            />
                                            {/* Thumbnail */}
                                            <div className="absolute inset-0 bg-black z-0 rounded-[3px] overflow-hidden">
                                                {asset ? (
                                                    <img
                                                        src={asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl}
                                                        alt={row.angleName || `Ad ${idx + 1}`}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-background-tertiary">
                                                        <ImageIcon className="w-4 h-4 text-foreground-subtle" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Ad Type badge - bottom center, outside thumbnail bounds */}
                                            {adTypeLabel && (
                                                <span className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full text-[9px] font-semibold whitespace-nowrap ${badgeBg} text-white shadow-sm`}>
                                                    {adTypeLabel}
                                                </span>
                                            )}

                                            {/* Name overlay */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-4 rounded-b-[3px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-5 h-5 flex items-center justify-center rounded bg-white/20 text-white text-[10px] font-bold flex-shrink-0">
                                                        {String(idx + 1).padStart(2, '0')}
                                                    </span>
                                                    <p className="text-xs font-semibold text-white truncate">
                                                        {row.angleName || 'Untitled'}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status indicators */}
                                            <div className="absolute top-1 right-1 flex flex-col gap-0.5 z-20">
                                                {row.lastPublishedAt && (
                                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-500/90 backdrop-blur-sm text-white text-[10px] font-medium">
                                                        <Send className="w-2.5 h-2.5" />
                                                    </span>
                                                )}
                                                {isReviewed && (
                                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-accent-success/90 backdrop-blur-sm text-white text-[10px] font-medium">
                                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                                    </span>
                                                )}
                                                {lastFromBuilder && !isReviewed && (
                                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-purple-500/90 backdrop-blur-sm text-white text-[10px] font-medium animate-pulse">
                                                        <MessageSquare className="w-2 h-2" />
                                                    </span>
                                                )}
                                                {needsChanges && !lastFromBuilder && (
                                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-medium">
                                                        <AlertCircle className="w-2 h-2" />
                                                    </span>
                                                )}
                                            </div>
                                            {isPending && (
                                                <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-foreground-subtle/50 flex items-center justify-center">
                                                    <div className="w-2 h-2 rounded-full bg-white/60" />
                                                </div>
                                            )}

                                            {isCurrent && (
                                                <div className="absolute top-6 right-1 px-1 py-0.5 bg-accent-primary rounded text-[8px] font-bold text-white z-10">
                                                    NOW
                                                </div>
                                            )}

                                            {/* Selection checkbox for reviewed ads - top left */}
                                            {isReviewed && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleRowSelection(row.id);
                                                    }}
                                                    className="absolute top-1 left-1 z-20 p-0.5 rounded bg-black/60 hover:bg-black/80 transition-colors"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-white/70" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Carousel Container */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden px-4">
                {/* Left Arrow - Fixed to stay visible during scroll */}
                <button
                    onClick={goToPrev}
                    className="fixed left-6 top-1/2 -translate-y-1/2 z-30 p-4 rounded-full bg-background-secondary border border-border hover:bg-background-tertiary transition-colors shadow-xl"
                    disabled={totalRows <= 1}
                >
                    <ChevronLeft className="w-8 h-8 text-foreground" />
                </button>

                {/* Cards Container */}
                <div className="flex items-center justify-center w-full max-w-4xl relative">
                    <AnimatePresence mode="wait">
                        {/* Previous card (blurred peek) */}
                        {currentIndex > 0 && (
                            <motion.div
                                key={`prev-${rows[currentIndex - 1].id}`}
                                initial={{ opacity: 0, x: -100 }}
                                animate={{ opacity: 0.3, x: 0 }}
                                className="absolute left-0 -translate-x-[85%] scale-75 blur-sm pointer-events-none"
                            >
                                <MiniCard row={rows[currentIndex - 1]} />
                            </motion.div>
                        )}

                        {/* Current card */}
                        <motion.div
                            key={currentRow.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.3 }}
                            className="w-full max-w-2xl"
                        >
                            <ReviewCard
                                row={currentRow}
                                index={currentIndex}
                                onUpdateRow={handleUpdateRow}
                                userName={user?.displayName || undefined}
                                globalSettings={globalSettings}
                                driveAccessToken={driveAccessToken}
                            />
                        </motion.div>

                        {/* Next card (blurred peek) */}
                        {currentIndex < totalRows - 1 && (
                            <motion.div
                                key={`next-${rows[currentIndex + 1].id}`}
                                initial={{ opacity: 0, x: 100 }}
                                animate={{ opacity: 0.3, x: 0 }}
                                className="absolute right-0 translate-x-[85%] scale-75 blur-sm pointer-events-none"
                            >
                                <MiniCard row={rows[currentIndex + 1]} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right Arrow - Fixed to stay visible during scroll */}
                <button
                    onClick={goToNext}
                    className="fixed right-6 top-1/2 -translate-y-1/2 z-30 p-4 rounded-full bg-background-secondary border border-border hover:bg-background-tertiary transition-colors shadow-xl"
                    disabled={totalRows <= 1}
                >
                    <ChevronRight className="w-8 h-8 text-foreground" />
                </button>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 py-3 border-t border-border bg-background-secondary">
                {rows.map((row, idx) => {
                    const isReviewed = row.reviewStatus === 'reviewed';
                    const comments = row.comments || [];
                    const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
                    const lastFromBuilder = lastComment?.author === 'builder' && !isReviewed;

                    return (
                        <button
                            key={row.id}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex
                                ? 'w-6 bg-accent-primary'
                                : isReviewed
                                    ? 'bg-accent-success'
                                    : lastFromBuilder
                                        ? 'bg-purple-500'
                                        : 'bg-foreground-subtle hover:bg-foreground-muted'
                                }`}
                            title={row.angleName || `Ad ${idx + 1}`}
                        />
                    );
                })}
            </div>

            {/* Selection Action Bar */}
            <AnimatePresence>
                {selectedRowIds.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-6 py-3 rounded-full bg-background-secondary/95 backdrop-blur-sm border-2 border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.4),0_4px_20px_rgba(0,0,0,0.5)]"
                    >
                        <span className="text-sm text-foreground">
                            {selectedRowIds.size} ad{selectedRowIds.size !== 1 ? 's' : ''} selected
                        </span>
                        <button
                            onClick={clearSelection}
                            className="text-sm text-foreground-muted hover:text-foreground"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => setShowPublishWizard(true)}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold hover:from-cyan-400 hover:to-teal-400 transition-all shadow-[0_0_20px_rgba(34,211,238,0.5)] hover:shadow-[0_0_30px_rgba(34,211,238,0.7)] animate-pulse"
                        >
                            <Upload className="w-4 h-4" />
                            Publish Selected
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Publish Wizard Modal */}
            <PublishWizard
                isOpen={showPublishWizard}
                onClose={() => setShowPublishWizard(false)}
                selectedAds={selectedAds}
                campaignName={campaign.name || 'Untitled Campaign'}
                driveFolderUrl={campaign.brief?.driveFolderUrl}
                onPublish={handlePublish}
                onPublishComplete={handlePublishComplete}
            />
        </div>
    );
}

// Copy button with visual feedback
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg bg-background-tertiary hover:bg-background-secondary text-foreground-muted hover:text-foreground transition-colors flex-shrink-0"
            title="Copy to clipboard"
        >
            {copied ? <Check className="w-4 h-4 text-accent-success" /> : <Copy className="w-4 h-4" />}
        </button>
    );
}

// Mini preview card for adjacent peek
function MiniCard({ row }: { row: AdRow }) {
    const selectedAsset = row.assets[0];
    const isReviewed = row.reviewStatus === 'reviewed';

    return (
        <div className={`w-64 rounded-xl border overflow-hidden bg-background-secondary ${isReviewed ? 'border-accent-success/50' : 'border-border'
            }`}>
            <div className="aspect-[4/3] bg-black">
                {selectedAsset ? (
                    <img
                        src={selectedAsset.permanentThumbnailUrl || selectedAsset.cachedThumbnail || selectedAsset.thumbnailUrl}
                        alt={selectedAsset.name}
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-foreground-subtle" />
                    </div>
                )}
            </div>
        </div>
    );
}

interface ReviewCardProps {
    row: AdRow;
    index: number;
    onUpdateRow: (rowId: string, updates: Partial<AdRow>) => void;
    userName?: string;
    globalSettings?: {
        adTypes?: typeof DEFAULT_AD_TYPES;
    };
    driveAccessToken?: string | null;
}

function ReviewCard({ row, index, onUpdateRow, userName, globalSettings, driveAccessToken }: ReviewCardProps) {
    const [selectedAssetIndex, setSelectedAssetIndex] = useState(0);
    const [feedbackText, setFeedbackText] = useState('');
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);

    // Reset video playback when switching assets (state adjustment during render)
    const [prevAssetKey, setPrevAssetKey] = useState<string>(`${row.id}:${selectedAssetIndex}`);
    const assetKey = `${row.id}:${selectedAssetIndex}`;
    if (assetKey !== prevAssetKey) {
        setPrevAssetKey(assetKey);
        setIsPlayingVideo(false);
    }

    const selectedAsset = row.assets[selectedAssetIndex] || row.assets[0];
    const hasMultipleAssets = row.assets.length > 1;

    // Carousels publish only Primary Text 1 (the message above all cards)
    const filledPrimaryTexts = (row.adType === 'carousel'
        ? row.slots.primaryTexts.slice(0, 1)
        : row.slots.primaryTexts
    ).filter(Boolean);
    // Carousel headlines render positionally (Card N = Headline N) so the
    // reviewer sees the deck exactly as it will publish, blanks included
    const isCarouselRow = row.adType === 'carousel';
    const displayHeadlines = isCarouselRow
        ? row.slots.headlines.slice(0, row.assets.length)
        : row.slots.headlines.filter(Boolean);
    const filledHeadlineCount = displayHeadlines.filter(Boolean).length;

    const isReviewed = row.reviewStatus === 'reviewed';
    const needsChanges = row.reviewStatus === 'needs_changes';

    // Comment helpers
    const comments = row.comments || [];
    const hasComments = comments.length > 0;
    const lastComment = hasComments ? comments[comments.length - 1] : null;
    const lastCommentFromBuilder = lastComment?.author === 'builder';

    const handleToggleReviewed = () => {
        onUpdateRow(row.id, {
            reviewStatus: isReviewed ? 'pending' : 'reviewed',
            approvedAt: isReviewed ? undefined : new Date().toISOString(),
        });
    };

    const handleSendFeedback = () => {
        if (!feedbackText.trim()) return;
        const newComment: AdComment = {
            id: crypto.randomUUID(),
            text: feedbackText.trim(),
            author: 'reviewer',
            authorName: userName || 'Reviewer',
            createdAt: new Date(),
        };
        onUpdateRow(row.id, {
            comments: [...comments, newComment],
            reviewStatus: 'needs_changes'
        });
        setFeedbackText('');
    };

    const handleClearComments = () => {
        onUpdateRow(row.id, { comments: [], reviewStatus: 'pending' });
    };

    return (
        <div
            className={`rounded-xl border-[3px] overflow-hidden bg-background-secondary shadow-xl ${isReviewed
                ? 'border-accent-success'
                : lastCommentFromBuilder
                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                    : needsChanges
                        ? 'border-amber-500'
                        : 'border-border'
                }`}
        >
            {/* === Zone 1: Header Bar === */}
            <div className="flex items-center justify-between px-4 py-2 bg-background-tertiary border-b border-border">
                {/* Left: Ad Type badge */}
                {(() => {
                    const adTypesConfig = mergeAdTypes(globalSettings?.adTypes);
                    const currentTypeIndex = adTypesConfig.findIndex(t => t.id === row.adType);
                    const currentType = currentTypeIndex >= 0 ? adTypesConfig[currentTypeIndex] : null;
                    const displayName = currentType?.displayName || (row.adType ? 'Unknown' : 'No Type');

                    const bgColors = [
                        'bg-blue-500/90', 'bg-emerald-500/90', 'bg-purple-500/90', 'bg-pink-500/90',
                        'bg-amber-500/90', 'bg-cyan-500/90', 'bg-rose-500/90', 'bg-indigo-500/90',
                    ];
                    const bgClass = currentType
                        ? bgColors[Math.max(AD_TYPE_COLORS.findIndex(c => c.id === currentType.color), 0)]
                        : 'bg-gray-500/90';

                    return (
                        <span className="flex items-center gap-1.5">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${bgClass} text-white`}>
                                {selectedAsset?.type === 'video' ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                                {displayName}
                            </span>
                            {row.adType === 'carousel' && <CarouselPairingHint />}
                        </span>
                    );
                })()}

                {/* Right: Duration + Asset count */}
                <div className="flex items-center gap-2">
                    {selectedAsset?.type === 'video' && selectedAsset.duration && (
                        <span className="px-2 py-0.5 rounded bg-foreground-subtle/20 text-foreground-muted text-xs font-medium">
                            {Math.floor(selectedAsset.duration / 60)}:{String(Math.floor(selectedAsset.duration % 60)).padStart(2, '0')}
                        </span>
                    )}
                    {shapeLabel(selectedAsset?.dimensions) && (
                        <span className="px-2 py-0.5 rounded bg-foreground-subtle/20 text-foreground-muted text-xs">
                            {shapeLabel(selectedAsset?.dimensions)}
                        </span>
                    )}
                </div>
            </div>

            {/* === Zone 2: Clean Viewport === */}
            <div className="relative bg-black" style={{ maxHeight: '400px' }}>
                {selectedAsset ? (
                    isPlayingVideo && selectedAsset.type === 'video' && selectedAsset.driveFileId && driveAccessToken ? (
                        /* Video player — only shown after user clicks play */
                        <div className="relative">
                            <video
                                key={selectedAsset.driveFileId}
                                src={`/api/video-proxy?fileId=${selectedAsset.driveFileId}`}
                                poster={selectedAsset.permanentThumbnailUrl || selectedAsset.cachedThumbnail || selectedAsset.thumbnailUrl}
                                controls
                                autoPlay
                                muted
                                playsInline
                                className="w-full object-contain"
                                style={{ maxHeight: '400px' }}
                            />
                            <button
                                onClick={() => setIsPlayingVideo(false)}
                                className="absolute top-2 right-2 p-1 rounded-full bg-black/70 hover:bg-black/90 text-white transition-colors z-10"
                                title="Stop preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        /* Thumbnail view — default for all assets */
                        <div className="relative group">
                            {(selectedAsset.permanentThumbnailUrl || selectedAsset.cachedThumbnail || selectedAsset.thumbnailUrl) ? (
                                <img
                                    src={selectedAsset.permanentThumbnailUrl || selectedAsset.cachedThumbnail || selectedAsset.thumbnailUrl}
                                    alt={selectedAsset.name}
                                    className="w-full object-contain"
                                    style={{ maxHeight: '400px' }}
                                />
                            ) : selectedAsset.type === 'video' ? (
                                <div className="flex items-center justify-center" style={{ height: '300px' }}>
                                    <Film className="w-12 h-12 text-foreground-subtle" />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center" style={{ height: '300px' }}>
                                    <ImageIcon className="w-12 h-12 text-foreground-subtle" />
                                </div>
                            )}
                            {/* Play button overlay for videos when Drive is connected */}
                            {selectedAsset.type === 'video' && selectedAsset.driveFileId && driveAccessToken && (
                                <button
                                    onClick={() => setIsPlayingVideo(true)}
                                    className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Play video"
                                >
                                    <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                        <Film className="w-7 h-7 text-black" />
                                    </div>
                                </button>
                            )}
                            {/* Amber nudge for videos when Drive is NOT connected */}
                            {selectedAsset.type === 'video' && selectedAsset.driveFileId && !driveAccessToken && (
                                <div className="group/nudge absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/90 backdrop-blur-sm text-white text-xs font-medium z-[3] cursor-default shadow-lg">
                                    <CloudOff className="w-3.5 h-3.5" />
                                    Connect Drive to preview
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/90 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/nudge:opacity-100 transition-opacity pointer-events-none">
                                        Go to Settings → Connections
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="flex items-center justify-center" style={{ height: '200px' }}>
                        <ImageIcon className="w-12 h-12 text-foreground-subtle" />
                    </div>
                )}
            </div>

            {/* Multi-media: stacks decide which shape serves where, so reviewers see them before approving */}
            {row.adType === 'multi_media' && row.assets.length > 0 && (
                <div className="px-4 py-3 bg-background-tertiary border-t border-border">
                    <MediaStacks
                        assets={row.assets}
                        size="lg"
                        selectedIndex={selectedAssetIndex}
                        onSelect={(i) => { setSelectedAssetIndex(i); setIsPlayingVideo(false); }}
                    />
                </div>
            )}

            {/* === Zone 3: Bottom Info Bar === */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-background-tertiary border-t border-border">
                {/* Left: Row number + Angle name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-7 h-7 flex items-center justify-center rounded-md bg-foreground-subtle/20 text-foreground-muted text-xs font-bold flex-shrink-0">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground truncate">
                        {row.angleName || 'Untitled'}
                    </h3>
                </div>

                {/* Center: Asset arrow navigation */}
                {hasMultipleAssets && (
                    <div className="flex items-center gap-1 px-3 flex-shrink-0">
                        <button
                            onClick={() => setSelectedAssetIndex((prev) => (prev - 1 + row.assets.length) % row.assets.length)}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            title="Previous asset"
                        >
                            <ChevronLeft className="w-4 h-4 text-foreground-muted" />
                        </button>
                        <span className="text-xs text-foreground-muted tabular-nums min-w-[2rem] text-center">
                            {selectedAssetIndex + 1} / {row.assets.length}
                        </span>
                        <button
                            onClick={() => setSelectedAssetIndex((prev) => (prev + 1) % row.assets.length)}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            title="Next asset"
                        >
                            <ChevronRight className="w-4 h-4 text-foreground-muted" />
                        </button>
                    </div>
                )}

                {/* Right: Status badges — Published supersedes Approved */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {row.lastPublishedAt ? (
                        <span className="group relative flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/90 text-white text-[11px] font-medium">
                            <Send className="w-3 h-3" />
                            Published
                            <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded bg-black/90 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Sent to Meta on {new Date(row.lastPublishedAt).toLocaleDateString()}
                            </span>
                        </span>
                    ) : isReviewed ? (
                        <span className="group relative flex items-center gap-1 px-2 py-1 rounded-full bg-accent-success/90 text-white text-[11px] font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Approved
                            {row.approvedAt && (
                                <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded bg-black/90 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    Approved on {new Date(row.approvedAt).toLocaleDateString()}
                                </span>
                            )}
                        </span>
                    ) : null}
                    {lastCommentFromBuilder && !isReviewed && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-purple-500/90 text-white text-[11px] font-medium animate-pulse">
                            <MessageSquare className="w-3 h-3" />
                            Response
                        </span>
                    )}
                    {needsChanges && !lastCommentFromBuilder && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 text-white text-[11px] font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Changes
                        </span>
                    )}
                </div>
            </div>

            {/* Generated Ad Name - for reviewer verification */}
            <div className={`px-5 py-3 border-b ${row.generatedAdName
                ? 'bg-background-tertiary/50 border-border/50'
                : 'bg-rose-500/10 border-rose-500/30'}`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider">
                            Ad Name
                        </span>
                        {!row.generatedAdName && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                Missing
                            </span>
                        )}
                    </div>
                </div>
                <p className={`mt-1 font-mono text-sm ${row.generatedAdName
                    ? 'text-foreground'
                    : 'text-foreground-muted italic'}`}
                >
                    {row.generatedAdName || 'No ad name set by builder'}
                </p>
            </div>

            {/* Copy Section */}
            <div className="p-5 space-y-4">
                {/* Two column layout for copy */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Primary Texts */}
                    <div>
                        <h4 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-2">
                            Primary Text ({filledPrimaryTexts.length})
                        </h4>
                        <div className="space-y-2">
                            {filledPrimaryTexts.length > 0 ? (
                                filledPrimaryTexts.map((slot, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 rounded-lg bg-background-tertiary/50 border border-border/50"
                                    >
                                        <span className="text-xs text-foreground-muted font-medium">{idx + 1}.</span>
                                        <p className="text-sm text-foreground leading-relaxed mt-0.5">
                                            {slot?.isCustomized ? slot.localText : slot?.masterItem.text}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-foreground-muted italic">No primary texts</p>
                            )}
                        </div>
                    </div>

                    {/* Headlines */}
                    <div>
                        <h4 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-2">
                            Headlines ({filledHeadlineCount})
                        </h4>
                        <div className="space-y-2">
                            {displayHeadlines.length > 0 ? (
                                displayHeadlines.map((slot, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 rounded-lg bg-background-tertiary/50 border border-border/50"
                                    >
                                        <span className="text-xs text-foreground-muted font-medium">
                                            {isCarouselRow ? `Card ${idx + 1}.` : `${idx + 1}.`}
                                        </span>
                                        {slot ? (
                                            <p className="text-sm text-foreground font-medium mt-0.5">
                                                {slot.isCustomized ? slot.localText : slot.masterItem.text}
                                            </p>
                                        ) : (
                                            <p className="text-sm text-foreground-muted italic mt-0.5">No headline</p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-xs text-foreground-muted italic">No headlines</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Destination URL */}
                {row.slots.destinationUrl && (
                    <div className="pt-3 border-t border-border">
                        <h4 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <Link2 className="w-3 h-3" />
                            Destination URL
                        </h4>
                        <div className="flex items-center gap-1.5">
                            <a
                                href={row.slots.destinationUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-accent-primary hover:underline truncate"
                            >
                                {row.slots.destinationUrl}
                            </a>
                            <CopyButton text={row.slots.destinationUrl} />
                        </div>
                    </div>
                )}

                {/* Comment Thread Section */}
                <div className="pt-3 border-t border-border">
                    <h4 className="text-xs font-semibold text-foreground-subtle uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <MessageSquare className="w-3 h-3" />
                        Comments {hasComments && `(${comments.length})`}
                    </h4>
                    {/* Existing comments */}
                    {hasComments && (
                        <div className="space-y-2 mb-3">
                            {comments.map((comment) => (
                                <div
                                    key={comment.id}
                                    className={`p-3 rounded-lg text-sm ${comment.author === 'builder'
                                        ? 'bg-accent-primary/10 border border-accent-primary/30'
                                        : 'bg-amber-500/10 border border-amber-500/30'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`font-medium ${comment.author === 'builder' ? 'text-accent-primary' : 'text-amber-500'
                                            }`}>
                                            {comment.authorName || (comment.author === 'builder' ? 'Builder' : 'Reviewer')}
                                        </span>
                                        <span className="text-xs text-foreground-subtle">
                                            {new Date(comment.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-foreground">{comment.text}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add feedback input - always visible, inline style like Build Mode */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendFeedback()}
                            placeholder="Add feedback for builder..."
                            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:border-amber-500"
                        />
                        <button
                            onClick={handleSendFeedback}
                            disabled={!feedbackText.trim()}
                            className="px-3 py-2 rounded-lg bg-amber-500 text-black disabled:opacity-50 hover:bg-amber-400 transition-colors"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                    {hasComments && (
                        <button
                            onClick={handleClearComments}
                            className="text-xs text-foreground-subtle hover:text-foreground mt-2"
                        >
                            Clear All Comments
                        </button>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-3 border-t border-border">
                    {row.lastPublishedAt && isReviewed ? (
                        /* Published + still reviewed → static badge */
                        <div className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-500 text-white">
                            <Send className="w-4 h-4" />
                            Published ✓
                        </div>
                    ) : row.lastPublishedAt && !isReviewed ? (
                        /* Published but pulled out of review (comments/changes) → re-approvable */
                        <button
                            onClick={handleToggleReviewed}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 transition-colors"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            Re-approve for Publish
                        </button>
                    ) : (
                        /* Never published → standard review toggle */
                        <button
                            onClick={handleToggleReviewed}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${isReviewed
                                ? 'bg-accent-success text-white'
                                : 'bg-background-tertiary text-foreground hover:bg-accent-success/20'
                                }`}
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            {isReviewed ? 'Reviewed ✓' : 'Mark Reviewed'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
