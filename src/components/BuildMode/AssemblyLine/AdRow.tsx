'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Copy, Trash2, FileText, Image as ImageIcon, Film, Link, Plus, ChevronLeft, ChevronRight, AlertTriangle, X, MessageSquare, Send, Settings2, Play, CloudOff } from 'lucide-react';
import { AdRow as AdRowType, CopyItem, SlotItem, Asset, AdType, AdComment, GlobalPromptSettings, mergeAdTypes, normalizeHeadlineSlots, CTA_OPTIONS, CallToAction } from '@/types';
import { CAROUSEL_MIN_CARDS } from '@/types/ad-types';
import { AD_TYPE_COLORS } from '@/types';
import { DropSlot } from './DropSlot';
import { AssetPickerPopover } from '@/components/AssetPickerPopover';
import { useAuth } from '@/components/AuthContext';
import { CarouselPairingHint } from '@/components/CarouselPairingHint';

// Portal-based tooltip that escapes overflow:hidden containers
function PortalTooltip({ text, children }: { text: string; children: React.ReactNode }) {
    const triggerRef = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (hovered && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({
                top: rect.top - 8,
                left: rect.left + rect.width / 2,
            });
        }
    }, [hovered]);

    return (
        <>
            <div
                ref={triggerRef}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="absolute bottom-1 right-1 z-[3]"
            >
                {children}
            </div>
            {hovered && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                    }}
                    className="px-2 py-1 rounded bg-black/90 text-white text-[10px] whitespace-nowrap pointer-events-none"
                >
                    {text}
                </div>,
                document.body
            )}
        </>
    );
}

interface AdRowProps {
    row: AdRowType;
    rowIndex: number;  // 0-based index for display as row number
    onUpdate: (updates: Partial<AdRowType>) => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onDuplicateStructure: () => void;
    onApplyToAllRows: (slotType: 'headline' | 'primary_text', slotIndex: number, item: SlotItem) => void;
    totalRows: number;  // To know if Apply to All should show
    // Drive assets (pre-loaded at campaign level)
    cachedDriveAssets: Asset[];
    // Used asset counts across all rows
    usedAssetCounts: Record<string, number>;
    // Auto-add to Active Palette when dropping from historical
    onAddToActive?: (item: CopyItem) => void;
    // Current user's display name for comments
    userName?: string;
    // Global settings for naming conventions
    globalSettings?: GlobalPromptSettings;
    // Callback to trigger asset reload (e.g., after Drive reconnect)
    onRefreshAssets?: () => void;
    // Whether a Drive folder has been configured
    hasFolderConfigured?: boolean;
    // Whether assets are currently loading
    isAssetsLoading?: boolean;
}

export function AdRow({
    row,
    rowIndex,
    onUpdate,
    onDelete,
    onDuplicate,
    onDuplicateStructure,
    onApplyToAllRows,
    totalRows,
    cachedDriveAssets,
    usedAssetCounts,
    onAddToActive,
    userName,
    globalSettings,
    onRefreshAssets,
    hasFolderConfigured,
    isAssetsLoading,
}: AdRowProps) {
    const { driveAccessToken } = useAuth();
    const [showMenu, setShowMenu] = useState(false);
    const [showAssetPicker, setShowAssetPicker] = useState(false);
    const [urlValue, setUrlValue] = useState(row.slots.destinationUrl || '');
    const [displayedAssetIndex, setDisplayedAssetIndex] = useState(0);

    // Re-sync URL input when row data changes (e.g., campaign switch or
    // Firestore rehydration) — state adjustment during render
    const [prevDestinationUrl, setPrevDestinationUrl] = useState(row.slots.destinationUrl || '');
    if ((row.slots.destinationUrl || '') !== prevDestinationUrl) {
        setPrevDestinationUrl(row.slots.destinationUrl || '');
        setUrlValue(row.slots.destinationUrl || '');
    }
    const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
    const [showComments, setShowComments] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [showNamingSettings, setShowNamingSettings] = useState(false);
    const [isEditingAngleName, setIsEditingAngleName] = useState(false);
    const [isPlayingVideo, setIsPlayingVideo] = useState(false);
    const [hasInteractedWithNaming, setHasInteractedWithNaming] = useState(false);

    // Mark as interacted when user opens naming panel OR if already has a
    // saved name — state adjustment during render
    if ((showNamingSettings || row.generatedAdName) && !hasInteractedWithNaming) {
        setHasInteractedWithNaming(true);
    }

    // Compute generated ad name at component level for autosave
    const computedGeneratedName = useMemo(() => {
        const templates = globalSettings?.namingTemplates || [];
        const defaultTemplateId = globalSettings?.defaultNamingTemplateId;
        if (templates.length === 0) return '';

        // Prefer row-level template, fall back to global default
        const rowTemplateId = row.namingValues?.templateId;
        const activeTemplate = templates.find(t => t.id === rowTemplateId)
            || templates.find(t => t.id === defaultTemplateId)
            || templates[0];
        if (!activeTemplate) return '';

        const adTypesConfig = mergeAdTypes(globalSettings?.adTypes);

        const parts = activeTemplate.tokens.map(tok => {
            let val = '';
            if (tok.type === 'auto') {
                if (tok.autoSource === 'angleName') {
                    val = row.angleName || '';
                } else if (tok.autoSource === 'adType') {
                    const adTypeConfig = adTypesConfig.find(t => t.id === row.adType);
                    val = adTypeConfig?.namingAlias || row.adType || '';
                }
            } else {
                val = row.namingValues?.values?.[tok.key] || '';
            }
            return val.replace(/\s+/g, '-');
        }).filter(Boolean);

        return parts.length > 0 ? parts.join(activeTemplate.separator) : '';
    }, [globalSettings, row.angleName, row.adType, row.namingValues]);

    // Sync generated name to row data — relies on page-level debounce for Firestore persistence
    useEffect(() => {
        // Only sync if user has interacted with naming panel
        if (!hasInteractedWithNaming) return;
        if (!computedGeneratedName || computedGeneratedName === row.generatedAdName) return;

        // Call onUpdate directly — the page-level 3s debounce handles coalescing
        onUpdate({ generatedAdName: computedGeneratedName });
    }, [computedGeneratedName, row.generatedAdName, onUpdate, hasInteractedWithNaming]);

    // Comment helpers
    const comments = row.comments || [];
    const hasComments = comments.length > 0;
    const lastComment = hasComments ? comments[comments.length - 1] : null;
    const lastCommentFromReviewer = lastComment?.author === 'reviewer';
    const lastCommentFromBuilder = lastComment?.author === 'builder';

    const handleAddComment = () => {
        if (!newCommentText.trim()) return;
        const newComment: AdComment = {
            id: crypto.randomUUID(),
            text: newCommentText.trim(),
            author: 'builder',
            authorName: userName || 'Builder',
            createdAt: new Date(),
        };
        onUpdate({
            comments: [...comments, newComment],
            reviewStatus: 'pending'  // Reset to pending when builder responds
        });
        setNewCommentText('');
    };

    const handleClearComments = () => {
        onUpdate({ comments: [], reviewStatus: 'pending' });
        setShowComments(false);
    };

    // Show duplicate warning with auto-dismiss
    const showDuplicateWarning = useCallback((columnName: string) => {
        setDuplicateWarning(`This copy already exists in ${columnName}. Customize the existing one to free up the original.`);
        // Auto-dismiss after 4 seconds
        setTimeout(() => setDuplicateWarning(null), 4000);
    }, []);

    // Convert CopyItem to SlotItem when dropped
    const handleSlotDrop = useCallback((
        slotType: 'headline' | 'primary_text',
        slotIndex: number,
        item: CopyItem
    ) => {
        // Get the slots for this column type
        const slotsInColumn = slotType === 'headline' ? row.slots.headlines : row.slots.primaryTexts;

        // Check for duplicates in the same column (excluding the target slot and customized slots)
        const isDuplicate = slotsInColumn.some((slot, idx) => {
            // Skip the slot we're dropping into
            if (idx === slotIndex) return false;
            // Skip empty slots
            if (!slot) return false;
            // If the slot is customized, the original text isn't "taken" - allow re-use
            if (slot.isCustomized) return false;
            // Check if the master item text matches
            return slot.masterItem.text === item.text;
        });

        if (isDuplicate) {
            // Show warning - can't add duplicate in same column
            const columnName = slotType === 'headline' ? 'Headlines' : 'Primary Texts';
            showDuplicateWarning(columnName);
            return; // Prevent the drop
        }

        // Auto-add historical items to Active Palette
        if (item.source === 'historical' && onAddToActive) {
            // Create a new item for the Active Palette
            const activeItem: CopyItem = {
                ...item,
                id: `${item.id}-active-${Date.now()}`,
                source: 'historical',
            };
            onAddToActive(activeItem);
        }

        const slotItem: SlotItem = {
            masterItem: item,
            isCustomized: false,
        };

        const updatedSlots = { ...row.slots };

        if (slotType === 'headline') {
            const newHeadlines = [...updatedSlots.headlines];
            newHeadlines[slotIndex] = slotItem;
            updatedSlots.headlines = newHeadlines;
        } else {
            const newPrimaryTexts = [...updatedSlots.primaryTexts];
            newPrimaryTexts[slotIndex] = slotItem;
            updatedSlots.primaryTexts = newPrimaryTexts;
        }

        onUpdate({ slots: updatedSlots });
    }, [row.slots, onAddToActive, onUpdate, showDuplicateWarning]);

    const handleSlotClear = (slotType: 'headline' | 'primary_text', slotIndex: number) => {
        const updatedSlots = { ...row.slots };

        if (slotType === 'headline') {
            const newHeadlines = [...updatedSlots.headlines];
            newHeadlines[slotIndex] = null;
            updatedSlots.headlines = newHeadlines;
        } else {
            const newPrimaryTexts = [...updatedSlots.primaryTexts];
            newPrimaryTexts[slotIndex] = null;
            updatedSlots.primaryTexts = newPrimaryTexts;
        }

        onUpdate({ slots: updatedSlots });
    };

    const handleLocalEdit = (
        slotType: 'headline' | 'primary_text',
        slotIndex: number,
        newText: string
    ) => {
        const updatedSlots = { ...row.slots };
        const slots = slotType === 'headline' ? updatedSlots.headlines : updatedSlots.primaryTexts;
        const currentSlot = slots[slotIndex];

        if (currentSlot) {
            const isCustomized = newText !== currentSlot.masterItem.text;
            const updatedSlot: SlotItem = {
                ...currentSlot,
                localText: isCustomized ? newText : undefined,
                isCustomized,
            };

            if (slotType === 'headline') {
                const newHeadlines = [...updatedSlots.headlines];
                newHeadlines[slotIndex] = updatedSlot;
                updatedSlots.headlines = newHeadlines;
            } else {
                const newPrimaryTexts = [...updatedSlots.primaryTexts];
                newPrimaryTexts[slotIndex] = updatedSlot;
                updatedSlots.primaryTexts = newPrimaryTexts;
            }

            onUpdate({ slots: updatedSlots });
        }
    };

    const handleApplyToAll = (slotType: 'headline' | 'primary_text', slotIndex: number) => {
        const slots = slotType === 'headline' ? row.slots.headlines : row.slots.primaryTexts;
        const item = slots[slotIndex];
        if (item) {
            onApplyToAllRows(slotType, slotIndex, item);
        }
    };

    const handleUrlChange = () => {
        onUpdate({
            slots: { ...row.slots, destinationUrl: urlValue || null },
        });
    };

    const handleSelectAssets = (assets: Asset[]) => {
        onUpdate({
            assets,
            slots: {
                ...row.slots,
                headlines: normalizeHeadlineSlots(row.slots.headlines, row.adType, assets.length),
            },
        });
        setDisplayedAssetIndex(0); // Reset to first asset
    };

    // Resolve ad type config by merging standardized metadata with user settings
    const adTypesConfig = useMemo(
        () => mergeAdTypes(globalSettings?.adTypes),
        [globalSettings?.adTypes]
    );

    const currentTypeConfig = adTypesConfig.find(t => t.id === row.adType) || adTypesConfig[0];
    const maxAssets = currentTypeConfig?.maxAssets || 10;

    // Handle ad type change with limit enforcement
    const handleTypeChange = (newType: AdType) => {
        const newTypeConfig = adTypesConfig.find(t => t.id === newType);
        const newMax = newTypeConfig?.maxAssets || 10;

        // If current assets exceed new max, trim them
        let updatedAssets = [...row.assets];
        if (updatedAssets.length > newMax) {
            updatedAssets = updatedAssets.slice(0, newMax);
        }

        onUpdate({
            adType: newType,
            assets: updatedAssets,
            slots: {
                ...row.slots,
                headlines: normalizeHeadlineSlots(row.slots.headlines, newType, updatedAssets.length),
            },
        });

        if (displayedAssetIndex >= newMax) {
            setDisplayedAssetIndex(0);
        }
    };

    const displayedAsset = row.assets[displayedAssetIndex] || row.assets[0];
    const hasAssets = row.assets.length > 0;
    const hasMultipleAssets = row.assets.length > 1;
    const showApplyToAll = totalRows > 1;

    return (
        <div className="bg-background-secondary border border-border rounded-xl p-4 hover:border-border-hover transition-colors relative">
            {/* Duplicate Warning Banner */}
            <AnimatePresence>
                {duplicateWarning && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-3"
                    >
                        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-amber-200">Duplicate Copy Blocked</p>
                            <p className="text-xs text-amber-300/80 mt-0.5">{duplicateWarning}</p>
                        </div>
                        <button
                            onClick={() => setDuplicateWarning(null)}
                            className="p-1 rounded hover:bg-amber-500/20 text-amber-400"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header Row: [Row #] [Angle Name] [Settings] ─────── [Comments] */}
            <div className="flex items-center gap-2 mb-4">
                {/* Row number badge */}
                <span className="w-7 h-7 flex items-center justify-center rounded-md bg-foreground-subtle/10 text-foreground-subtle text-xs font-bold">
                    {String(rowIndex + 1).padStart(2, '0')}
                </span>

                {/* Left zone: Angle Name + Settings (naming/identity) */}
                {/* Click-to-edit Angle Name */}
                {isEditingAngleName ? (
                    <input
                        type="text"
                        value={row.angleName || ''}
                        onChange={(e) => onUpdate({ angleName: e.target.value })}
                        onBlur={() => setIsEditingAngleName(false)}
                        onKeyDown={(e) => e.key === 'Enter' && setIsEditingAngleName(false)}
                        placeholder="Angle Name..."
                        autoFocus
                        className="px-2 py-1 text-base font-semibold rounded bg-background border border-accent-primary focus:outline-none text-foreground"
                    />
                ) : (
                    <span
                        onClick={() => setIsEditingAngleName(true)}
                        className="px-2 py-1 text-base font-semibold rounded cursor-text hover:bg-background-tertiary transition-colors text-foreground"
                        title="Click to edit"
                    >
                        {row.angleName || <span className="text-foreground-subtle/60 italic">Angle Name...</span>}
                    </span>
                )}

                {/* Settings button - right next to angle name */}
                <div className="relative">
                    <button
                        onClick={() => setShowNamingSettings(!showNamingSettings)}
                        className={`p-1.5 rounded-lg border transition-colors ${showNamingSettings
                            ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                            : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground hover:border-border-hover'
                            }`}
                        title="Ad Naming Settings"
                    >
                        <Settings2 className="w-4 h-4" />
                    </button>
                    {/* Pulsing warning dot if ad name is missing */}
                    {!row.generatedAdName && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                    )}
                </div>

                {/* Published badge - prominent blue tag */}
                {row.lastPublishedAt && (
                    <span
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/50 text-blue-400 text-xs font-medium"
                        title={`Sent to Meta on ${new Date(row.lastPublishedAt).toLocaleDateString()}`}
                    >
                        <Send className="w-3 h-3" />
                        Published
                    </span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Right zone: Comments (collaboration) */}
                {!showComments && (
                    <button
                        onClick={() => setShowComments(true)}
                        className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 ${lastCommentFromReviewer
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 animate-pulse'
                            : lastCommentFromBuilder
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-400'
                                : hasComments
                                    ? 'bg-accent-primary/20 border-accent-primary/50 text-accent-primary'
                                    : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground hover:border-border-hover'
                            }`}
                        title={hasComments ? `${comments.length} comment(s)` : 'Add comment'}
                    >
                        <MessageSquare className="w-5 h-5" />
                        {hasComments && <span className="text-sm font-medium">{comments.length}</span>}
                    </button>
                )}
            </div>

            {/* Comment Thread Panel (Expandable) - now below header */}
            <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-3 rounded-lg bg-background-tertiary border border-border"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-foreground">Comments ({comments.length})</span>
                            <div className="flex items-center gap-2">
                                {hasComments && (
                                    <button
                                        onClick={handleClearComments}
                                        className="text-[10px] text-foreground-muted hover:text-foreground"
                                    >
                                        Clear All
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowComments(false)}
                                    className="p-1 rounded hover:bg-background text-foreground-muted"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {/* Comment Thread */}
                        <div className="space-y-2 max-h-32 overflow-y-auto mb-2">
                            {comments.length === 0 ? (
                                <p className="text-xs text-foreground-muted italic">No comments yet</p>
                            ) : (
                                comments.map((comment) => (
                                    <div
                                        key={comment.id}
                                        className={`p-2 rounded text-xs ${comment.author === 'builder'
                                            ? 'bg-accent-primary/10 border border-accent-primary/30'
                                            : 'bg-amber-500/10 border border-amber-500/30'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1 mb-0.5">
                                            <span className={`font-medium ${comment.author === 'builder' ? 'text-accent-primary' : 'text-amber-500'
                                                }`}>
                                                {comment.authorName || (comment.author === 'builder' ? 'Builder' : 'Reviewer')}
                                            </span>
                                            <span className="text-foreground-subtle text-[10px]">
                                                {new Date(comment.createdAt).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <p className="text-foreground">{comment.text}</p>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Add Comment Input */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                placeholder="Add a note for reviewer..."
                                className="flex-1 px-3 py-1.5 text-sm rounded-lg bg-background border border-border focus:border-accent-primary focus:outline-none"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={!newCommentText.trim()}
                                className="px-3 py-1.5 rounded-lg bg-accent-primary text-white disabled:opacity-50 hover:bg-accent-primary-hover transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Naming Settings Panel - with actual template data */}
            <AnimatePresence>
                {showNamingSettings && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 p-3 rounded-lg bg-background-tertiary border border-border"
                    >
                        {/* Show templates from global settings */}
                        {(() => {
                            const templates = globalSettings?.namingTemplates || [];
                            const defaultTemplateId = globalSettings?.defaultNamingTemplateId;
                            const hasTemplates = templates.length > 0;

                            if (!hasTemplates) {
                                return (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-foreground-muted">
                                            No templates. <span className="text-accent-primary">Settings → Naming</span> to configure.
                                        </p>
                                        <button
                                            onClick={() => setShowNamingSettings(false)}
                                            className="p-1 rounded hover:bg-background text-foreground-muted"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            }

                            const activeTemplate = templates.find(t => t.id === row.namingValues?.templateId)
                                || templates.find(t => t.id === defaultTemplateId)
                                || templates[0];

                            return (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-foreground-subtle whitespace-nowrap">Template:</span>
                                        <select
                                            value={activeTemplate?.id || ''}
                                            onChange={(e) => {
                                                const newTemplateId = e.target.value;
                                                onUpdate({
                                                    namingValues: {
                                                        templateId: newTemplateId,
                                                        values: row.namingValues?.values || {}
                                                    }
                                                });
                                            }}
                                            className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border focus:border-accent-primary focus:outline-none"
                                        >
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => setShowNamingSettings(false)}
                                            className="p-1 rounded hover:bg-background text-foreground-muted"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>

                                    {/* Compact inline token fields */}
                                    {activeTemplate && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {activeTemplate.tokens.map((token, idx) => (
                                                <React.Fragment key={token.id}>
                                                    {idx > 0 && (
                                                        <span className="text-foreground-subtle text-xs">{activeTemplate.separator}</span>
                                                    )}
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] text-foreground-subtle">{token.label}:</span>
                                                        {token.type === 'dropdown' && token.options ? (
                                                            <select
                                                                value={row.namingValues?.values?.[token.key] || ''}
                                                                onChange={(e) => {
                                                                    const newValues = {
                                                                        templateId: activeTemplate.id,
                                                                        values: {
                                                                            ...row.namingValues?.values,
                                                                            [token.key]: e.target.value
                                                                        }
                                                                    };
                                                                    onUpdate({ namingValues: newValues });
                                                                }}
                                                                className="px-1.5 py-0.5 text-xs rounded bg-background border border-border focus:border-accent-primary focus:outline-none min-w-[80px]"
                                                            >
                                                                <option value="">—</option>
                                                                {token.options.map(opt => (
                                                                    <option key={opt} value={opt}>{opt}</option>
                                                                ))}
                                                            </select>
                                                        ) : token.type === 'auto' ? (
                                                            <span className="px-1.5 py-0.5 text-xs rounded bg-background/50 border border-border/50 text-foreground-muted">
                                                                {token.autoSource === 'angleName'
                                                                    ? (row.angleName || '—')
                                                                    : (adTypesConfig.find(t => t.id === row.adType)?.namingAlias || row.adType || '—')}
                                                            </span>
                                                        ) : (
                                                            <input
                                                                type="text"
                                                                value={row.namingValues?.values?.[token.key] || ''}
                                                                onChange={(e) => {
                                                                    const newValues = {
                                                                        templateId: activeTemplate.id,
                                                                        values: {
                                                                            ...row.namingValues?.values,
                                                                            [token.key]: e.target.value
                                                                        }
                                                                    };
                                                                    onUpdate({ namingValues: newValues });
                                                                }}
                                                                placeholder="..."
                                                                className="px-1.5 py-0.5 text-xs rounded bg-background border border-border focus:border-accent-primary focus:outline-none w-20"
                                                            />
                                                        )}
                                                    </div>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    )}

                                    {/* Generated name preview + autosave status */}
                                    <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                                        <span className="text-[10px] text-foreground-subtle">Ad Name:</span>
                                        <code className="flex-1 px-2 py-1 text-xs font-mono rounded bg-background border border-accent-primary/30 text-foreground truncate">
                                            {computedGeneratedName || '(fill tokens above)'}
                                        </code>
                                        {computedGeneratedName && computedGeneratedName !== row.generatedAdName && (
                                            <span className="text-[10px] text-foreground-muted animate-pulse">Saving...</span>
                                        )}
                                        {computedGeneratedName && computedGeneratedName === row.generatedAdName && (
                                            <span className="text-[10px] text-green-400">✓ Saved</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex gap-4">
                {/* Visual Anchor (Thumbnail) */}
                <div className="w-32 flex-shrink-0 relative">
                    {hasAssets ? (
                        <div className="flex flex-col items-center gap-1">
                            {/* Asset card — taller vertical layout */}
                            <div
                                className="relative"
                            >
                                {/* Stacking visual for multiple assets */}
                                {hasMultipleAssets && (
                                    <>
                                        <div className="absolute top-1 left-1 w-28 h-44 rounded-lg bg-background-tertiary/60 border border-border/40" />
                                        <div className="absolute top-0.5 left-0.5 w-28 h-44 rounded-lg bg-background-tertiary/80 border border-border/60" />
                                    </>
                                )}
                                <div className="relative w-28 h-44 rounded-lg overflow-hidden bg-background-tertiary border border-border flex flex-col">
                                    {/* Image/Video area — takes most of the height */}
                                    <div className="relative flex-1 overflow-hidden group">
                                        {isPlayingVideo && displayedAsset.type === 'video' && displayedAsset.driveFileId && driveAccessToken ? (
                                            /* Inline video player */
                                            <>
                                                <video
                                                    src={`/api/video-proxy?fileId=${displayedAsset.driveFileId}`}
                                                    autoPlay
                                                    muted
                                                    playsInline
                                                    loop
                                                    className="w-full h-full object-cover"
                                                />
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setIsPlayingVideo(false); }}
                                                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 hover:bg-black/90 text-white transition-colors z-10"
                                                    title="Stop preview"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </>
                                        ) : (displayedAsset.permanentThumbnailUrl || displayedAsset.cachedThumbnail || displayedAsset.thumbnailUrl) ? (
                                            <>
                                                <img
                                                    src={displayedAsset.permanentThumbnailUrl || displayedAsset.cachedThumbnail || displayedAsset.thumbnailUrl}
                                                    alt={displayedAsset.name}
                                                    className="w-full h-full object-cover"
                                                />
                                                {/* Play button overlay for videos — only covers image area */}
                                                {displayedAsset.type === 'video' && displayedAsset.driveFileId && driveAccessToken && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setIsPlayingVideo(true); }}
                                                        className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Preview video"
                                                    >
                                                        <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                                                            <Play className="w-4 h-4 text-black ml-0.5" />
                                                        </div>
                                                    </button>
                                                )}

                                            </>
                                        ) : displayedAsset.type === 'video' ? (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                                                <Film className="w-8 h-8 text-foreground-muted" />
                                            </div>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
                                                <ImageIcon className="w-8 h-8 text-foreground-muted" />
                                            </div>
                                        )}
                                        {/* Duration badge for videos */}
                                        {displayedAsset.type === 'video' && displayedAsset.duration && !isPlayingVideo && (
                                            <span className="absolute top-1 right-1 px-1 py-0.5 text-[9px] font-medium rounded bg-black/70 text-white z-[3]">
                                                {Math.floor(displayedAsset.duration / 60)}:{String(Math.floor(displayedAsset.duration % 60)).padStart(2, '0')}
                                            </span>
                                        )}
                                        {/* Type + Orientation badges */}
                                        <div className="absolute bottom-1 left-1 flex gap-1">
                                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white uppercase">
                                                {displayedAsset.type === 'video' ? 'VID' : 'IMG'}
                                            </span>
                                            {displayedAsset.dimensions && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/60 text-white">
                                                    {displayedAsset.dimensions.width < displayedAsset.dimensions.height
                                                        ? '9:16'
                                                        : displayedAsset.dimensions.width > displayedAsset.dimensions.height
                                                            ? '16:9'
                                                            : '1:1'}
                                                </span>
                                            )}
                                        </div>
                                        {/* Amber nudge for videos when Drive is NOT connected */}
                                        {displayedAsset.type === 'video' && displayedAsset.driveFileId && !driveAccessToken && (
                                            <PortalTooltip text="Connect Drive to preview">
                                                <div className="p-1 rounded bg-amber-500/90 text-white cursor-default">
                                                    <CloudOff className="w-3 h-3" />
                                                </div>
                                            </PortalTooltip>
                                        )}
                                    </div>
                                    {/* Bottom control bar — separated from image area */}
                                    <div className="flex items-center justify-center gap-1 py-1 px-1 bg-background-secondary border-t border-border shrink-0">
                                        <button
                                            onClick={() => setShowAssetPicker(true)}
                                            className="flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-foreground-muted hover:text-foreground hover:bg-white/10 transition-colors"
                                            title="Edit assets"
                                        >
                                            Edit
                                        </button>
                                        <div className="w-px h-3 bg-border" />
                                        <button
                                            onClick={() => { onUpdate({ assets: [], slots: { ...row.slots, headlines: normalizeHeadlineSlots(row.slots.headlines, row.adType, 0) } }); setDisplayedAssetIndex(0); setIsPlayingVideo(false); }}
                                            className="flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                            title="Clear assets"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                                {/* Position indicator for multiple assets */}
                                {hasMultipleAssets && (
                                    <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-accent-primary text-[10px] font-bold">
                                        {displayedAssetIndex + 1}/{row.assets.length}
                                    </span>
                                )}
                            </div>
                            {/* Cycle controls below the card */}
                            {hasMultipleAssets && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setDisplayedAssetIndex((prev) => (prev - 1 + row.assets.length) % row.assets.length)}
                                        className="p-1 rounded hover:bg-white/10 transition-colors"
                                        title="Previous asset"
                                    >
                                        <ChevronLeft className="w-4 h-4 text-foreground-muted" />
                                    </button>
                                    <span className="text-xs text-foreground-muted">
                                        {displayedAssetIndex + 1} / {row.assets.length}
                                    </span>
                                    <button
                                        onClick={() => setDisplayedAssetIndex((prev) => (prev + 1) % row.assets.length)}
                                        className="p-1 rounded hover:bg-white/10 transition-colors"
                                        title="Next asset"
                                    >
                                        <ChevronRight className="w-4 h-4 text-foreground-muted" />
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAssetPicker(true)}
                            className="w-28 h-44 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-accent-drive hover:bg-accent-drive/5 transition-colors gap-1"
                        >
                            <Plus className="w-6 h-6 text-foreground-subtle" />
                            <span className="text-xs text-foreground-subtle">Add Asset</span>
                        </button>
                    )}

                    {/* Asset Picker Popover */}
                    <AssetPickerPopover
                        isOpen={showAssetPicker}
                        onClose={() => setShowAssetPicker(false)}
                        onSelectAssets={handleSelectAssets}
                        currentAssets={row.assets}
                        cachedAssets={cachedDriveAssets}
                        usedAssetCounts={usedAssetCounts}
                        maxSelection={maxAssets}
                        onRefreshAssets={onRefreshAssets}
                        hasFolderConfigured={hasFolderConfigured}
                        isLoading={isAssetsLoading}
                    />

                    {/* Ad Type Dropdown */}
                    <div className="w-full mt-3">
                        <span className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wide mb-1 block">
                            Ad Type
                        </span>
                        {(() => {
                            const currentType = adTypesConfig.find(t => t.id === row.adType);

                            // Styles per color id, in AD_TYPE_COLORS order - bg + border combos
                            const colorStyles = [
                                { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-300' },
                                { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-300' },
                                { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-300' },
                                { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-300' },
                                { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-300' },
                                { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-300' },
                                { bg: 'bg-rose-500/20', border: 'border-rose-500/50', text: 'text-rose-300' },
                                { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-300' },
                            ];

                            const colorIndex = AD_TYPE_COLORS.findIndex(c => c.id === currentType?.color);
                            const style = currentType
                                ? colorStyles[Math.max(colorIndex, 0)]
                                : { bg: 'bg-rose-500/10', border: 'border-rose-500/40', text: 'text-rose-300' };

                            return (
                                <div className="space-y-2">
                                    <select
                                        value={row.adType || ''}
                                        onChange={(e) => handleTypeChange(e.target.value as AdType)}
                                        className={`w-full px-3 py-2 text-xs font-medium rounded-full ${style.bg} border ${style.border} ${style.text} focus:outline-none cursor-pointer appearance-none transition-all hover:opacity-90`}
                                        style={{
                                            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff80' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                            backgroundPosition: 'right 0.5rem center',
                                            backgroundRepeat: 'no-repeat',
                                            backgroundSize: '1rem 1rem',
                                            paddingRight: '2rem',
                                        }}
                                    >
                                        {!row.adType && (
                                            <option value="" disabled>Select Type...</option>
                                        )}
                                        {adTypesConfig.map((type) => (
                                            <option key={type.id} value={type.id}>
                                                {type.displayName}
                                            </option>
                                        ))}
                                    </select>

                                    {/* Asset counter/limit indicator */}
                                    <div className="flex flex-col gap-0.5 px-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] text-foreground-subtle uppercase tracking-wider flex items-center gap-1">
                                                Assets
                                                {row.adType === 'carousel' && <CarouselPairingHint />}
                                            </span>
                                            <span className={`text-[9px] font-bold ${row.assets.length >= maxAssets ? 'text-accent-primary' : 'text-foreground-muted'}`}>
                                                {row.assets.length} / {maxAssets}
                                            </span>
                                        </div>
                                        {row.adType === 'carousel' && row.assets.length < CAROUSEL_MIN_CARDS && (
                                            <span className="text-[10px] leading-tight text-amber-400">
                                                Needs at least {CAROUSEL_MIN_CARDS} cards to publish
                                            </span>
                                        )}
                                        {currentTypeConfig?.recommendedUse && (
                                            <span className="text-[10px] leading-tight text-foreground-subtle/80 italic">
                                                {currentTypeConfig.recommendedUse}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Copy Slots */}
                <div className="flex-1 grid grid-cols-2 gap-4">
                    {/* Primary Text Slots */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-3 h-3 text-foreground-subtle" />
                            <span className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
                                Primary Text
                            </span>
                        </div>
                        {/* Carousels publish a single message above all cards — show one
                            slot; slots 2–5 keep their data for a switch back to other types */}
                        {(row.adType === 'carousel' ? row.slots.primaryTexts.slice(0, 1) : row.slots.primaryTexts).map((item, index) => (
                            <DropSlot
                                key={`pt-${index}`}
                                slotType="primary_text"
                                slotIndex={index}
                                item={item}
                                onDrop={(droppedItem) => handleSlotDrop('primary_text', index, droppedItem)}
                                onClear={() => handleSlotClear('primary_text', index)}
                                onLocalEdit={(newText) => handleLocalEdit('primary_text', index, newText)}
                                onApplyToAll={() => handleApplyToAll('primary_text', index)}
                                showApplyToAll={showApplyToAll && item !== null}
                                placeholder={row.adType === 'carousel' ? 'Primary Text — shown above all cards' : `Primary Text ${index + 1}`}
                            />
                        ))}
                        {row.adType === 'carousel' && (
                            <p className="text-[10px] leading-tight text-foreground-subtle/80 italic px-1">
                                Carousels use one primary text, shown above every card.
                            </p>
                        )}
                    </div>

                    {/* Headline Slots */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
                                Headlines
                            </span>
                        </div>
                        {row.slots.headlines.map((item, index) => (
                            <DropSlot
                                key={`h-${index}`}
                                slotType="headline"
                                slotIndex={index}
                                item={item}
                                onDrop={(droppedItem) => handleSlotDrop('headline', index, droppedItem)}
                                onClear={() => handleSlotClear('headline', index)}
                                onLocalEdit={(newText) => handleLocalEdit('headline', index, newText)}
                                onApplyToAll={() => handleApplyToAll('headline', index)}
                                showApplyToAll={showApplyToAll && item !== null}
                                placeholder={`Headline ${index + 1}`}
                            />
                        ))}
                    </div>
                </div>

                {/* URL Input + Actions */}
                <div className="flex flex-col justify-between w-56">
                    {/* URL Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Link className="w-3 h-3 text-foreground-subtle" />
                            <span className="text-xs font-medium text-foreground-subtle uppercase tracking-wide">
                                Destination URL
                            </span>
                        </div>
                        <input
                            type="url"
                            value={urlValue}
                            onChange={(e) => setUrlValue(e.target.value)}
                            onBlur={handleUrlChange}
                            placeholder="https://..."
                            className="w-full px-3 py-2 text-sm bg-background-tertiary border border-border rounded-lg focus:outline-none focus:border-accent-primary transition-colors"
                        />
                    </div>

                    {/* CTA Selector */}
                    <div className="mt-3">
                        <span className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wide mb-1 block">
                            Call to Action
                        </span>
                        <select
                            value={row.callToAction || 'LEARN_MORE'}
                            onChange={(e) => onUpdate({ callToAction: e.target.value as CallToAction })}
                            className="w-full px-3 py-2 text-xs font-medium rounded-lg bg-background-tertiary border border-border text-foreground focus:outline-none focus:border-accent-primary cursor-pointer transition-colors"
                        >
                            {CTA_OPTIONS.map((cta) => (
                                <option key={cta.id} value={cta.id}>
                                    {cta.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Row Actions */}
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
                        >
                            <MoreVertical className="w-4 h-4 text-foreground-muted" />
                        </button>

                        {showMenu && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute bottom-full right-0 mb-2 w-48 bg-background-tertiary border border-border rounded-lg shadow-lg overflow-hidden z-10"
                            >
                                <button
                                    onClick={() => { onDuplicate(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors"
                                >
                                    <Copy className="w-4 h-4" />
                                    Duplicate Row
                                </button>
                                <button
                                    onClick={() => { onDuplicateStructure(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors"
                                >
                                    <FileText className="w-4 h-4" />
                                    Duplicate Structure
                                </button>
                                <button
                                    onClick={() => { onDelete(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent-error hover:bg-accent-error/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Row
                                </button>
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
