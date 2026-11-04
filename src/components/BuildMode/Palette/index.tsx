'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Paintbrush, Download, Loader2, Search, X, Trash2, Sparkles, Columns2, PanelRightClose, TrendingUp, PenLine } from 'lucide-react';
import type { AdRow, CopyItem } from '@/types';
import { rowLabel } from '@/lib/ai/rowContext';
import { HistoricalWins } from './HistoricalWins';
import { ActivePalette } from './ActivePalette';
import { WriteYourOwn } from './WriteYourOwn';
import type { CopyTarget } from '../CopyTarget';
import { COPY_TYPE } from '@/components/copyType';
import { TOP_COPY_MAX_PER_TYPE, TOP_COPY_SPEND_SHARE } from '@/lib/meta/topCopy';
import { DEFAULT_ACTIVE_VIEW, type ActiveView, type CopyUsage } from '@/lib/activePalette';

interface PaletteProps {
    historicalItems: CopyItem[];
    activeItems: CopyItem[];
    onRemoveFromActive: (id: string) => void;
    onRemoveManyFromActive: (ids: string[]) => void;
    onEditActiveItem: (id: string, newText: string) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    usage: Map<string, CopyUsage>;
    // Meta integration
    onImportFromMeta?: (productFilter?: string) => Promise<void>;
    isImportingFromMeta?: boolean;
    metaConnected?: boolean;
    onClearHistorical?: () => void;
    /** The last import's result, shown under the search row until dismissed. */
    importNote?: { ok: boolean; message: string } | null;
    onDismissImportNote?: () => void;
    // Copywriter: write variations of a card for the selected ad
    onRiff?: (item: CopyItem) => void;
    // The selected ad: every tab's Use adds to it, and the copywriter writes for it
    rows: AdRow[];
    targetRowId: string | null;
    onTargetRow: (rowId: string) => void;
    target: CopyTarget;
    // Tabs are controlled so a row's sparkle button can open the copywriter
    tab: PaletteTab;
    onTabChange: (tab: PaletteTab) => void;
    /** Which part of the Copy tab shows: Top performers (the default), the copywriter, or Write your own. */
    copyView: CopyView;
    onCopyViewChange: (view: CopyView) => void;
    // Wide = split screen with the rows
    isWide: boolean;
    onToggleWide: () => void;
    /** The copywriter panel. Always mounted (hidden when not shown) so its conversation survives tab switches. */
    copywriter?: React.ReactNode;
}

export type PaletteTab = 'copy' | 'active';
export type CopyView = 'top' | 'write' | 'own';

const COPY_VIEWS: { id: CopyView; label: string; icon: React.ElementType }[] = [
    { id: 'top', label: 'Top performers', icon: TrendingUp },
    { id: 'write', label: 'Copywriter', icon: Sparkles },
    { id: 'own', label: 'Write your own', icon: PenLine },
];

const TAB_META: { id: PaletteTab; label: string; icon: React.ElementType }[] = [
    { id: 'copy', label: 'Copy', icon: Sparkles },
    { id: 'active', label: 'Active', icon: Paintbrush },
];

export function Palette({
    historicalItems,
    activeItems,
    onRemoveFromActive,
    onRemoveManyFromActive,
    onEditActiveItem,
    onRiff,
    isCollapsed,
    onToggleCollapse,
    usage,
    onImportFromMeta,
    isImportingFromMeta = false,
    metaConnected = false,
    onClearHistorical,
    importNote,
    onDismissImportNote,
    rows,
    targetRowId,
    onTargetRow,
    target,
    tab: activeTab,
    onTabChange: setActiveTab,
    copyView,
    onCopyViewChange,
    isWide,
    onToggleWide,
    copywriter,
}: PaletteProps) {
    const [showImportOptions, setShowImportOptions] = useState(false);
    const [productFilter, setProductFilter] = useState('');
    const [activeView, setActiveView] = useState<ActiveView>(DEFAULT_ACTIVE_VIEW);

    const closeImport = () => { setShowImportOptions(false); setProductFilter(''); };
    const runImport = () => {
        onImportFromMeta?.(productFilter.trim() || undefined);
        closeImport();
    };

    const canImport = metaConnected && !!onImportFromMeta;
    const importActions = (canImport || (historicalItems.length > 0 && onClearHistorical)) ? (
        <>
            {historicalItems.length > 0 && onClearHistorical && (
                <button
                    onClick={onClearHistorical}
                    className="shrink-0 p-2 rounded-md text-foreground-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Clear all top performers"
                    aria-label="Clear all top performers"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            )}
            {canImport && (
                <button
                    onClick={() => (showImportOptions ? closeImport() : setShowImportOptions(true))}
                    disabled={isImportingFromMeta}
                    aria-expanded={showImportOptions}
                    title="Import top performers from Meta"
                    className="shrink-0 flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-md bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                >
                    {isImportingFromMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isImportingFromMeta ? 'Importing…' : 'Import'}</span>
                </button>
            )}
        </>
    ) : null;

    const importPanel = (showImportOptions && canImport && !isImportingFromMeta) || importNote ? (
        <div className="space-y-2">
            <AnimatePresence initial={false}>
                {showImportOptions && canImport && !isImportingFromMeta && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden space-y-1.5"
                        onSubmit={e => { e.preventDefault(); runImport(); }}
                    >
                        <div className="flex items-center gap-1.5">
                            <div className="flex-1 relative min-w-0">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted" />
                                <input
                                    type="text"
                                    value={productFilter}
                                    onChange={e => setProductFilter(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Escape') closeImport(); }}
                                    placeholder="Product (optional)"
                                    aria-label="Only ads whose ad or campaign name contains"
                                    className="w-full h-8 pl-7 pr-2 text-xs rounded-md bg-background-tertiary border border-border/50 focus:border-accent-primary focus:outline-none text-foreground placeholder:text-foreground-subtle"
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="shrink-0 h-8 px-2.5 rounded-md text-xs font-medium bg-[#1877F2]/15 text-[#6EA8FE] hover:bg-[#1877F2]/25 transition-colors">
                                {productFilter.trim() ? 'Import matching' : 'Import all'}
                            </button>
                            <button type="button" onClick={closeImport} aria-label="Cancel import" className="shrink-0 p-2 rounded-md hover:bg-background-tertiary text-foreground-muted">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                        <p className="text-[10px] text-foreground-subtle px-0.5">
                            Last 90 days: the copy behind {Math.round(TOP_COPY_SPEND_SHARE * 100)}% of spend, up to {TOP_COPY_MAX_PER_TYPE} of each.
                        </p>
                    </motion.form>
                )}
            </AnimatePresence>
            {importNote && (
                <div role="status" className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[11px] ${importNote.ok ? 'bg-accent-success/10 text-accent-success' : 'bg-amber-500/10 text-amber-300'}`}>
                    <span className="flex-1">{importNote.message}</span>
                    {onDismissImportNote && (
                        <button onClick={onDismissImportNote} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            )}
        </div>
    ) : null;

    const showCopy = !isCollapsed && activeTab === 'copy';

    return (
        <aside
            style={{ width: isCollapsed ? 48 : isWide ? '50%' : 360 }}
            className={`@container/palette h-full shrink-0 bg-background-secondary border-l-2 border-amber-500/30 flex flex-col overflow-hidden relative transition-[width] duration-300 ease-out ${isWide && !isCollapsed ? 'min-w-[360px]' : ''}`}
        >
            {/* Amber accent strip */}
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-600" />

            {isCollapsed ? (
                /* Collapsed: expand, or jump straight to a tab */
                <div className="flex flex-col items-center gap-1 py-2">
                    <button
                        onClick={onToggleCollapse}
                        className="flex flex-col items-center gap-2 w-full py-2 hover:bg-amber-500/5 transition-colors"
                        aria-label="Expand palette"
                        title="Expand palette"
                    >
                        <div className="p-1.5 rounded-lg bg-amber-500/20">
                            <Paintbrush className="w-4 h-4 text-amber-400" />
                        </div>
                        <ChevronRight className="w-4 h-4 text-amber-400 rotate-180" />
                    </button>
                    <div className="w-6 h-px bg-border my-1" />
                    {TAB_META.map(t => (
                        <button
                            key={t.id}
                            onClick={() => { setActiveTab(t.id); onToggleCollapse(); }}
                            className={`p-2 rounded-lg transition-colors ${t.id === 'copy' ? 'text-purple-300 hover:bg-purple-500/10' : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'}`}
                            aria-label={`Open ${t.label}`}
                            title={t.label}
                        >
                            <t.icon className="w-4 h-4" />
                        </button>
                    ))}
                </div>
            ) : (
                /* One row: the tabs, then Split and collapse */
                <div className="flex items-stretch h-11 pl-1 pr-3 border-b border-border">
                    {TAB_META.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 text-[13px] font-medium transition-colors relative ${activeTab === t.id
                                ? 'text-foreground'
                                : 'text-foreground-muted hover:text-foreground'
                                }`}
                        >
                            <t.icon className={`w-4 h-4 shrink-0 ${t.id === 'copy' ? 'text-purple-400' : ''}`} />
                            <span>{t.label}</span>
                            {t.id === 'active' && activeItems.length > 0 && (
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-primary text-white">
                                    {activeItems.length}
                                </span>
                            )}
                            {activeTab === t.id && (
                                <motion.div
                                    layoutId="paletteTab"
                                    className={`absolute bottom-0 left-2 right-2 h-0.5 ${t.id === 'copy' ? 'bg-purple-400' : 'bg-accent-primary'}`}
                                />
                            )}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={onToggleWide}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isWide
                                ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                                : 'bg-background-tertiary text-foreground-muted hover:bg-amber-500/10 hover:text-amber-300'}`}
                            title={isWide ? 'Back to a narrow palette' : 'Split the screen between the rows and the palette'}
                            aria-pressed={isWide}
                        >
                            <Columns2 className="w-4 h-4" />
                            <span>{isWide ? 'Narrow' : 'Split'}</span>
                        </button>
                        <button
                            onClick={onToggleCollapse}
                            className="p-1.5 rounded-lg bg-background-tertiary text-foreground-muted hover:bg-amber-500/10 hover:text-amber-300 transition-all"
                            title="Collapse palette"
                            aria-label="Collapse palette"
                        >
                            <PanelRightClose className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* The selected ad: shared by every tab */}
            {!isCollapsed && <SelectedAdBar rows={rows} targetRowId={targetRowId} onTargetRow={onTargetRow} />}

            {/* Copy: Top performers, the copywriter or your own, one at a time at full width */}
            <div className={showCopy ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
                <div className="flex items-center gap-1 m-2 p-0.5 rounded-lg bg-background-tertiary" role="tablist" aria-label="Copy source">
                    {COPY_VIEWS.map(v => (
                        <button
                            key={v.id}
                            role="tab"
                            aria-selected={copyView === v.id}
                            onClick={() => onCopyViewChange(v.id)}
                            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${copyView === v.id
                                ? 'bg-background text-foreground shadow-sm'
                                : 'text-foreground-muted hover:text-foreground'}`}
                        >
                            <v.icon className={`w-3.5 h-3.5 shrink-0 hidden @sm/palette:block ${v.id === 'write' ? 'text-purple-400' : ''}`} />
                            <span className="truncate">{v.label}</span>
                        </button>
                    ))}
                </div>

                <div className={copyView === 'top' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
                    <HistoricalWins
                        items={historicalItems}
                        onRiff={onRiff}
                        target={target}
                        actions={importActions}
                        below={importPanel}
                        emptyHint={metaConnected
                            ? 'Import your top-spending copy from Meta.'
                            : 'Connect Meta in Settings to import your top-spending copy.'}
                    />
                </div>

                {/* Always mounted, so the conversation survives tab switches and collapsing */}
                <div className={copyView === 'write' ? 'flex-1 min-h-0 flex flex-col' : 'hidden'}>
                    {copywriter}
                </div>

                {copyView === 'own' && (
                    <WriteYourOwn target={target} activeItems={activeItems} />
                )}
            </div>

            {/* Active: this campaign's copy, at a glance */}
            {!isCollapsed && activeTab === 'active' && (
                <div className="flex-1 overflow-y-auto">
                    <ActivePalette
                        items={activeItems}
                        onRemove={onRemoveFromActive}
                        onRemoveMany={onRemoveManyFromActive}
                        onEdit={onEditActiveItem}
                        onRiff={onRiff}
                        usage={usage}
                        view={activeView}
                        onViewChange={setActiveView}
                        rows={rows}
                        targetRowId={targetRowId}
                        onTargetRow={onTargetRow}
                        target={target}
                    />
                </div>
            )}
        </aside>
    );
}

/** Which ad Use adds to and the copywriter writes for, with how full its copy slots are. */
function SelectedAdBar({ rows, targetRowId, onTargetRow }: {
    rows: AdRow[];
    targetRowId: string | null;
    onTargetRow: (rowId: string) => void;
}) {
    const row = rows.find(r => r.id === targetRowId);
    const filled = (slots: unknown[]) => slots.filter(Boolean).length;
    const ptSlots = row ? (row.adType === 'carousel' ? row.slots.primaryTexts.slice(0, 1) : row.slots.primaryTexts) : [];
    return (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-purple-500/5">
            <span className="text-[11px] font-medium text-purple-300 shrink-0">Selected ad</span>
            <select
                value={targetRowId ?? ''}
                onChange={e => onTargetRow(e.target.value)}
                disabled={rows.length === 0}
                aria-label="Selected ad"
                className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-background-tertiary border border-border text-xs text-foreground focus:outline-none focus:border-purple-400"
            >
                {rows.length === 0 && <option value="">No ads yet</option>}
                {rows.map((r, i) => <option key={r.id} value={r.id}>{rowLabel(r, i)}</option>)}
            </select>
            {row && (
                <span className="text-[10px] text-foreground-subtle shrink-0" title="Filled headline and primary text slots">
                    <span className={COPY_TYPE.headline.text}>H {filled(row.slots.headlines)}/{row.slots.headlines.length}</span>
                    {' · '}
                    <span className={COPY_TYPE.primary_text.text}>PT {filled(ptSlots)}/{ptSlots.length}</span>
                </span>
            )}
        </div>
    );
}
