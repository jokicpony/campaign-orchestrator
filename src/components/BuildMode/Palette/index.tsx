'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, TrendingUp, Paintbrush, Download, Loader2, Search, X, Trash2 } from 'lucide-react';
import { CopyItem } from '@/types';
import { HistoricalWins } from './HistoricalWins';
import { ActivePalette } from './ActivePalette';

interface PaletteProps {
    historicalItems: CopyItem[];
    activeItems: CopyItem[];
    onAddToActive: (item: CopyItem) => void;
    onRemoveFromActive: (id: string) => void;
    onEditActiveItem: (id: string, newText: string) => void;
    onAddManualCopy?: (text: string, type: 'headline' | 'primary_text') => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    usageCounts?: Map<string, number>;
    // Meta integration
    onImportFromMeta?: (productFilter?: string) => Promise<void>;
    isImportingFromMeta?: boolean;
    metaConnected?: boolean;
    onClearHistorical?: () => void;
}

type PaletteTab = 'top-performers' | 'active';

export function Palette({
    historicalItems,
    activeItems,
    onAddToActive,
    onRemoveFromActive,
    onEditActiveItem,
    onAddManualCopy,
    isCollapsed,
    onToggleCollapse,
    usageCounts,
    onImportFromMeta,
    isImportingFromMeta = false,
    metaConnected = false,
    onClearHistorical,
}: PaletteProps) {
    const [activeTab, setActiveTab] = useState<PaletteTab>('top-performers');
    const [showImportOptions, setShowImportOptions] = useState(false);
    const [productFilter, setProductFilter] = useState('');

    const handleImportClick = () => {
        if (showImportOptions) {
            // Already open, do the import
            onImportFromMeta?.(productFilter || undefined);
            setShowImportOptions(false);
            setProductFilter('');
        } else {
            // Open the filter input
            setShowImportOptions(true);
        }
    };

    // Import with current filter (or all if no filter)
    const handleImportWithFilter = () => {
        onImportFromMeta?.(productFilter.trim() || undefined);
        setShowImportOptions(false);
        setProductFilter('');
    };

    // Explicitly import all without filter
    const handleImportAll = () => {
        onImportFromMeta?.();
        setShowImportOptions(false);
        setProductFilter('');
    };

    return (
        <motion.aside
            initial={false}
            animate={{
                width: isCollapsed ? 48 : 360,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="h-full bg-background-secondary border-l-2 border-amber-500/30 flex flex-col overflow-hidden relative"
        >
            {/* Amber accent strip */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-600" />

            {/* Collapse toggle */}
            <button
                onClick={onToggleCollapse}
                className="flex items-center h-14 border-b border-border hover:bg-amber-500/5 transition-all group"
            >
                {isCollapsed ? (
                    /* Collapsed state - vertical text */
                    <div className="flex flex-col items-center justify-center w-full gap-2 py-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/20">
                            <Paintbrush className="w-4 h-4 text-amber-400" />
                        </div>
                        <motion.div
                            animate={{ rotate: 180 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ChevronRight className="w-4 h-4 text-amber-400" />
                        </motion.div>
                    </div>
                ) : (
                    /* Expanded state */
                    <div className="flex items-center justify-between w-full px-4">
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-amber-500/15 group-hover:bg-amber-500/25 transition-colors">
                                <Paintbrush className="w-5 h-5 text-amber-400" />
                            </div>
                            <div className="flex flex-col items-start">
                                <span className="font-semibold text-sm text-foreground">Palette</span>
                                <span className="text-[10px] text-foreground-subtle">Copy Library</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-background-tertiary text-foreground-muted group-hover:bg-amber-500/10 group-hover:text-amber-300 transition-all">
                            <span className="text-xs font-medium">Collapse</span>
                            <ChevronRight className="w-4 h-4" />
                        </div>
                    </div>
                )}
            </button>

            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        {/* Tab Navigation */}
                        <div className="flex border-b border-border">
                            <button
                                onClick={() => setActiveTab('top-performers')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors relative ${activeTab === 'top-performers'
                                    ? 'text-foreground'
                                    : 'text-foreground-muted hover:text-foreground'
                                    }`}
                            >
                                <TrendingUp className="w-4 h-4" />
                                <span>Top Performers</span>
                                {activeTab === 'top-performers' && (
                                    <motion.div
                                        layoutId="paletteTab"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                                    />
                                )}
                            </button>
                            <button
                                onClick={() => setActiveTab('active')}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium transition-colors relative ${activeTab === 'active'
                                    ? 'text-foreground'
                                    : 'text-foreground-muted hover:text-foreground'
                                    }`}
                            >
                                <Paintbrush className="w-4 h-4" />
                                <span>Active</span>
                                {activeItems.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-primary text-white">
                                        {activeItems.length}
                                    </span>
                                )}
                                {activeTab === 'active' && (
                                    <motion.div
                                        layoutId="paletteTab"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                                    />
                                )}
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto">
                            <AnimatePresence mode="wait">
                                {activeTab === 'top-performers' ? (
                                    <motion.div
                                        key="top-performers"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <div className="px-3 py-2 border-b border-border/50">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground-subtle">Last 90 days • Drag to slots</span>
                                                <div className="flex items-center gap-1">
                                                    {/* Clear button - only show when there are items */}
                                                    {historicalItems.length > 0 && onClearHistorical && (
                                                        <button
                                                            onClick={onClearHistorical}
                                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-foreground-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                            title="Clear all top performers"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                    {metaConnected && onImportFromMeta && (
                                                        <button
                                                            onClick={handleImportClick}
                                                            disabled={isImportingFromMeta}
                                                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                                                        >
                                                            {isImportingFromMeta ? (
                                                                <>
                                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                                    Importing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Download className="w-3 h-3" />
                                                                    Import from Meta
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Product Filter Input */}
                                            <AnimatePresence>
                                                {showImportOptions && metaConnected && !isImportingFromMeta && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="mt-2 overflow-hidden"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 relative">
                                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted" />
                                                                <input
                                                                    type="text"
                                                                    value={productFilter}
                                                                    onChange={(e) => setProductFilter(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            handleImportWithFilter();
                                                                        }
                                                                    }}
                                                                    placeholder="Filter by product name"
                                                                    className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md bg-background-tertiary border border-border/50 focus:border-accent-primary focus:outline-none text-foreground placeholder:text-foreground-subtle"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setShowImportOptions(false);
                                                                    setProductFilter('');
                                                                }}
                                                                className="p-1.5 rounded-md hover:bg-background-tertiary text-foreground-muted"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <button
                                                                onClick={handleImportAll}
                                                                className="text-xs text-foreground-muted hover:text-foreground transition-colors"
                                                            >
                                                                Import all
                                                            </button>
                                                            <span className="text-xs text-foreground-subtle">or press Enter to filter</span>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <HistoricalWins items={historicalItems} activeItems={activeItems} onAddToActive={onAddToActive} />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="active"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <ActivePalette
                                            items={activeItems}
                                            onRemove={onRemoveFromActive}
                                            onEdit={onEditActiveItem}
                                            onAdd={onAddManualCopy}
                                            usageCounts={usageCounts}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.aside>
    );
}
