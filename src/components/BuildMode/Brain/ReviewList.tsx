'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Shuffle, Clock, Trash2, PenLine, Send, Undo2, ChevronDown } from 'lucide-react';
import { GeneratedItem, GenerationSession, IterationAction } from '@/types';

interface ReviewListProps {
    pendingItems: GeneratedItem[];
    sessions: GenerationSession[];
    iterationActions?: IterationAction[];
    onAccept: (itemId: string) => void;
    onAcceptMultiple: (itemIds: string[]) => void;
    onReject: (itemId: string) => void;
    onRejectMultiple: (itemIds: string[]) => void;
    onClearPending: () => void;
    onAddFromHistory: (item: GeneratedItem) => void;
    onIterate: (modifierId: string, baseCopy?: { text: string; type: 'headline' | 'primary_text' }, customDirection?: string) => void;
    onRemix: (selectedItems?: Array<{ text: string; type: 'headline' | 'primary_text' }>) => void;
    onClearHistory: () => void;
    showHistory: boolean;
    onToggleHistory: () => void;
    canUndo: boolean;
    onUndo: () => void;
    onIterateFromHistory: (item: GeneratedItem) => void;
}

type HistoryFilter = 'all' | 'accepted' | 'rejected';

export function ReviewList({
    pendingItems,
    sessions,
    iterationActions = [],
    onAcceptMultiple,
    onRejectMultiple,
    onClearPending,
    onIterate,
    onRemix,
    onClearHistory,
    showHistory,
    onToggleHistory,
    canUndo,
    onUndo,
}: ReviewListProps) {
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customDirection, setCustomDirection] = useState('');
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

    const hasItems = pendingItems.length > 0;
    const hasSessions = sessions.length > 0;
    const selectedItems = pendingItems.filter(i => selectedItemIds.has(i.id));
    const hasSelection = selectedItems.length > 0;

    const toggleItemSelection = (itemId: string) => {
        setSelectedItemIds(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
        setShowCustomInput(false);
        setCustomDirection('');
    };

    const toggleSelectAll = () => {
        if (selectedItems.length === pendingItems.length) {
            setSelectedItemIds(new Set());
        } else {
            setSelectedItemIds(new Set(pendingItems.map(i => i.id)));
        }
    };

    const handleIterateOnSelected = (modifierId: string) => {
        selectedItems.forEach(item => {
            onIterate(modifierId, { text: item.text, type: item.type });
        });
        setSelectedItemIds(new Set());
        setShowCustomInput(false);
        setCustomDirection('');
    };

    const handleCustomIterate = () => {
        if (hasSelection && customDirection.trim().length > 0) {
            selectedItems.forEach(item => {
                onIterate('custom', { text: item.text, type: item.type }, customDirection.trim());
            });
            setSelectedItemIds(new Set());
            setShowCustomInput(false);
            setCustomDirection('');
        }
    };

    const handleAcceptSelected = () => {
        onAcceptMultiple(selectedItems.map(i => i.id));
        setSelectedItemIds(new Set());
    };

    const handleRejectSelected = () => {
        onRejectMultiple(selectedItems.map(i => i.id));
        setSelectedItemIds(new Set());
    };

    return (
        <div className="flex flex-col h-full">
            {/* Scrollable items area */}
            <div className="flex-1 overflow-auto min-h-0 space-y-4">
                {/* Pending Items */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                            📋 Review List
                            {hasItems && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-primary text-white">
                                    {pendingItems.length}
                                </span>
                            )}
                        </h4>
                        {hasItems && (
                            <div className="flex items-center gap-2">
                                {canUndo && (
                                    <button
                                        onClick={onUndo}
                                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-foreground-subtle/10 text-foreground-muted hover:text-foreground hover:bg-foreground-subtle/20 transition-colors"
                                        title="Undo last accept/reject"
                                    >
                                        <Undo2 className="w-3 h-3" />
                                        Undo
                                    </button>
                                )}
                                <button
                                    onClick={onClearPending}
                                    className="text-xs text-foreground-muted hover:text-accent-error transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                    </div>

                    <AnimatePresence mode="popLayout">
                        {hasItems ? (
                            <div className="space-y-2">
                                {/* Select All toggle */}
                                <div className="flex items-center justify-between px-1">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="text-xs text-foreground-subtle hover:text-foreground-muted transition-colors"
                                    >
                                        {selectedItems.length === pendingItems.length ? '✕ Deselect All' : '☐ Select All'}
                                    </button>
                                    {hasSelection && (
                                        <span className="text-xs text-purple-400">
                                            {selectedItems.length} selected
                                        </span>
                                    )}
                                </div>

                                {pendingItems.map((item, index) => {
                                    const isSelected = selectedItemIds.has(item.id);
                                    return (
                                        <motion.div
                                            key={item.id}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20, height: 0 }}
                                            transition={{ delay: index * 0.05 }}
                                            className={`group flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isSelected
                                                ? 'bg-purple-500/10 border-purple-500/50 ring-1 ring-purple-500/30'
                                                : 'bg-background-tertiary border-border hover:border-border-hover'
                                                }`}
                                            onClick={() => toggleItemSelection(item.id)}
                                        >
                                            {/* Selection checkbox */}
                                            <span className={`shrink-0 w-4 h-4 mt-0.5 rounded border flex items-center justify-center transition-colors ${isSelected
                                                ? 'bg-purple-500 border-purple-500'
                                                : 'border-border-hover group-hover:border-foreground-subtle'
                                                }`}>
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </span>

                                            {/* Type badge */}
                                            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${item.type === 'headline'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : 'bg-purple-500/20 text-purple-400'
                                                }`}>
                                                {item.type === 'headline' ? 'H' : 'PT'}
                                            </span>

                                            {/* Text */}
                                            <p className="flex-1 text-sm text-foreground" style={{ whiteSpace: 'pre-line' }}>{item.text}</p>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="py-6 text-center text-sm text-foreground-subtle"
                            >
                                Generated copy will appear here for review
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>{/* end scrollable area */}

            {/* Fixed Action Bar — always at bottom, never scrolls */}
            {hasItems && (
                <div className="shrink-0 bg-[#141416] border-t border-border/50 pt-4 pb-3 px-1">
                    {!hasSelection ? (
                        <p className="text-xs text-foreground-subtle text-center py-1">
                            Select items to accept, reject, or remix
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {/* Row 1: Core trio — Accept / Reject / Remix */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={handleAcceptSelected}
                                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border font-medium bg-accent-success/20 border-accent-success/40 text-accent-success hover:bg-accent-success/30 transition-colors"
                                    >
                                        <Check className="w-3 h-3" />
                                        Accept{selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                                    </button>
                                    <button
                                        onClick={handleRejectSelected}
                                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border font-medium bg-accent-error/20 border-accent-error/40 text-accent-error hover:bg-accent-error/30 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => onRemix(selectedItems.map(i => ({ text: i.text, type: i.type })))}
                                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border font-medium bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition-colors"
                                        title={selectedItems.length > 1 ? 'Generate 5 fresh variations inspired by all selected' : 'Generate 5 fresh variations of this item'}
                                    >
                                        <Shuffle className="w-3 h-3" />
                                        Remix{selectedItems.length > 1 ? ` (${selectedItems.length})` : ''}
                                    </button>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedItemIds(new Set());
                                        setShowCustomInput(false);
                                        setCustomDirection('');
                                    }}
                                    className="text-xs text-foreground-subtle hover:text-foreground px-2 py-1 rounded hover:bg-white/5"
                                >
                                    ✕ {selectedItems.length} selected
                                </button>
                            </div>

                            {/* Row 2: Precision Refinement */}
                            {selectedItems.length === 1 ? (
                                <AnimatePresence>
                                    {showCustomInput ? (
                                        <motion.div
                                            key="custom-input"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-1.5"
                                        >
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={customDirection}
                                                    onChange={(e) => setCustomDirection(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && customDirection.trim()) {
                                                            handleCustomIterate();
                                                        }
                                                    }}
                                                    placeholder="e.g., 'add urgency' or 'make it a question'"
                                                    className="flex-1 px-3 py-1.5 text-sm bg-background border border-purple-500/30 rounded-lg focus:outline-none focus:border-purple-500 placeholder:text-foreground-subtle"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={handleCustomIterate}
                                                    disabled={!customDirection.trim()}
                                                    className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors flex items-center gap-1"
                                                >
                                                    <Send className="w-3 h-3" />
                                                    Go
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setShowCustomInput(false);
                                                    setCustomDirection('');
                                                }}
                                                className="text-[10px] text-foreground-subtle hover:text-foreground"
                                            >
                                                ← back
                                            </button>
                                        </motion.div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs text-foreground-subtle mr-1">Iterate on this copy:</span>
                                            {iterationActions.map(mod => (
                                                <button
                                                    key={mod.id}
                                                    onClick={() => handleIterateOnSelected(mod.id)}
                                                    className="px-2.5 py-1 text-xs rounded-full border bg-background border-border text-foreground-muted hover:border-purple-500/30 hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
                                                >
                                                    {mod.emoji} {mod.label}
                                                </button>
                                            ))}
                                            <button
                                                onClick={() => setShowCustomInput(true)}
                                                className="px-2.5 py-1 text-xs rounded-full border border-border text-foreground-muted hover:border-amber-500/30 hover:text-amber-300 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                                            >
                                                <PenLine className="w-3 h-3" />
                                                Custom
                                            </button>
                                        </div>
                                    )}
                                </AnimatePresence>
                            ) : (
                                <div className="flex items-center gap-1.5 flex-wrap opacity-35 pointer-events-none">
                                    <span className="text-xs text-foreground-subtle mr-1">Iterate:</span>
                                    {iterationActions.map(mod => (
                                        <span
                                            key={mod.id}
                                            className="px-2.5 py-1 text-xs rounded-full border bg-background border-border text-foreground-muted"
                                        >
                                            {mod.emoji} {mod.label}
                                        </span>
                                    ))}
                                    <span className="text-xs text-foreground-muted ml-1.5 opacity-100">
                                        — select one to iterate
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Session History — fixed bottom, expands upward */}
            {hasSessions && (
                <div className="shrink-0 bg-[#141416] border-t border-border/30 px-1 py-2">
                    <button
                        onClick={onToggleHistory}
                        className="flex items-center justify-between w-full text-xs font-medium text-foreground hover:text-purple-300 transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                    >
                        <span className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-purple-400" />
                            Session History
                            <span className="text-[10px] text-foreground-muted font-normal">
                                ({sessions.reduce((acc, s) => acc + s.items.filter(i => i.status !== 'pending').length, 0)})
                            </span>
                        </span>
                        <motion.span
                            animate={{ rotate: showHistory ? 180 : 0 }}
                            className="text-foreground-muted"
                        >
                            <ChevronDown className="w-3.5 h-3.5" />
                        </motion.span>
                    </button>

                    <AnimatePresence>
                        {showHistory && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                {/* Filter Toggle */}
                                <div className="flex items-center gap-1 pt-2 pb-1.5 px-1">
                                    {(['all', 'accepted', 'rejected'] as HistoryFilter[]).map(filter => (
                                        <button
                                            key={filter}
                                            onClick={() => setHistoryFilter(filter)}
                                            className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${historyFilter === filter
                                                ? filter === 'accepted'
                                                    ? 'bg-accent-success/20 text-accent-success'
                                                    : filter === 'rejected'
                                                        ? 'bg-accent-error/20 text-accent-error'
                                                        : 'bg-purple-500/20 text-purple-400'
                                                : 'bg-background text-foreground-subtle hover:text-foreground-muted'
                                                }`}
                                        >
                                            {filter === 'all' ? '🔮 All' : filter === 'accepted' ? '✅ Accepted' : '❌ Rejected'}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2 max-h-48 overflow-y-auto px-1">
                                    {sessions.slice().reverse().map(session => {
                                        const filteredItems = session.items.filter(i => {
                                            if (i.status === 'pending') return false;
                                            if (historyFilter === 'all') return true;
                                            return i.status === historyFilter;
                                        });
                                        if (filteredItems.length === 0) return null;

                                        return (
                                            <div key={session.id} className="space-y-1">
                                                <p className="text-[10px] text-foreground-subtle">
                                                    {session.context.slice(0, 50)}...
                                                </p>
                                                {filteredItems.map(item => (
                                                    <div
                                                        key={item.id}
                                                        className="flex items-center gap-2 p-1.5 bg-background rounded border border-border/50 text-sm text-foreground-muted"
                                                    >
                                                        <span className="text-[10px] shrink-0" title={item.status === 'accepted' ? 'Accepted' : 'Rejected'}>
                                                            {item.status === 'accepted' ? '✅' : '❌'}
                                                        </span>
                                                        <span className={`shrink-0 px-1 py-0.5 text-[8px] font-medium rounded uppercase ${item.type === 'headline'
                                                            ? 'bg-blue-500/20 text-blue-400'
                                                            : 'bg-purple-500/20 text-purple-400'
                                                            }`}>
                                                            {item.type === 'headline' ? 'H' : 'PT'}
                                                        </span>
                                                        <span className="flex-1 truncate text-xs">{item.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center justify-between mt-1.5 px-1">
                                    {canUndo ? (
                                        <button
                                            onClick={onUndo}
                                            className="flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                                            title="Undo last accept/reject"
                                        >
                                            <Undo2 className="w-3 h-3" />
                                            Undo
                                        </button>
                                    ) : (
                                        <span className="text-[10px] text-foreground-subtle italic">no actions to undo</span>
                                    )}
                                    <button
                                        onClick={onClearHistory}
                                        className="flex items-center gap-1 text-xs text-foreground-muted hover:text-accent-error transition-colors"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        Clear
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
