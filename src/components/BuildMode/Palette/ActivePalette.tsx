'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Pencil, Sparkles, ChevronRight, Search, Target } from 'lucide-react';
import type { AdRow, CopyItem } from '@/types';
import { Draggable } from '@/lib/dnd';
import { CopyEditorModal } from './CopyEditorModal';
import { TypeFilterToggle } from './TypeFilterToggle';
import { UseButton, UseNote, useUseNote, type CopyTarget } from '../CopyTarget';
import { COPY_TYPE } from '@/components/copyType';
import { rowLabel } from '@/lib/ai/rowContext';
import {
    arrangeActive, isFiltered, DEFAULT_ACTIVE_VIEW, SEARCH_FROM,
    type ActiveView, type ActiveSort, type CopyUsage, type SourceFilter,
} from '@/lib/activePalette';

interface ActivePaletteProps {
    items: CopyItem[];
    onRemove: (id: string) => void;
    /** Remove several at once (Clear unused). */
    onRemoveMany: (ids: string[]) => void;
    onEdit: (id: string, newText: string) => void;
    onRiff?: (item: CopyItem) => void;
    usage: Map<string, CopyUsage>;
    /** Filters and sort; held by the Palette so they survive tab switches. */
    view: ActiveView;
    onViewChange: (view: ActiveView) => void;
    rows: AdRow[];
    targetRowId: string | null;
    /** Select an ad (and scroll to it), from a card's "Used in" list. */
    onTargetRow: (rowId: string) => void;
    /** The selected ad: Use adds a card to it. */
    target?: CopyTarget;
}

const SOURCES: { id: SourceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'historical', label: 'Top performers' },
    { id: 'ai_generated', label: 'Copywriter' },
    { id: 'manual', label: 'Yours' },
];

const SORTS: { id: ActiveSort; label: string }[] = [
    { id: 'used', label: 'Most used' },
    { id: 'newest', label: 'Newest' },
    { id: 'performance', label: 'Top performance' },
];

/** Badge per source, named like the Copy tab's views. */
const SOURCE_BADGE: Record<CopyItem['source'], { label: string; className: string }> = {
    historical: { label: 'Top performer', className: 'bg-accent-success/20 text-accent-success' },
    ai_generated: { label: 'Copywriter', className: 'bg-purple-500/20 text-purple-400' },
    manual: { label: 'Yours', className: 'bg-foreground-subtle/20 text-foreground-subtle' },
};

/** "Used in" shows this many ads, then "+N". */
const USED_IN_MAX = 4;

export function ActivePalette({
    items, onRemove, onRemoveMany, onEdit, onRiff, usage, view, onViewChange,
    rows, targetRowId, onTargetRow, target,
}: ActivePaletteProps) {
    const [useNote, showUseNote] = useUseNote();
    const [editingItem, setEditingItem] = useState<CopyItem | null>(null);
    const set = (patch: Partial<ActiveView>) => onViewChange({ ...view, ...patch });

    const headlineCount = useMemo(() => items.filter(i => i.type === 'headline').length, [items]);
    const primaryTextCount = items.length - headlineCount;
    const inUseCount = useMemo(() => items.filter(i => (usage.get(i.id)?.slots ?? 0) > 0).length, [items, usage]);
    const unusedTotal = items.length - inUseCount;

    const thisAd = view.thisAd && !!targetRowId;
    const { inUse, unused } = useMemo(
        () => arrangeActive(items, usage, view, targetRowId),
        [items, usage, view, targetRowId],
    );

    const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
    const showSearch = items.length >= SEARCH_FROM || view.query !== '';
    const filtered = isFiltered(view) || view.type !== 'all';

    const handleEditSave = (text: string) => {
        if (editingItem) onEdit(editingItem.id, text);
        setEditingItem(null);
    };

    if (items.length === 0) {
        return (
            <div className="px-4 py-8 text-center text-foreground-subtle text-sm">
                Copy you use in this campaign shows up here
            </div>
        );
    }

    const renderCard = (item: CopyItem) => {
        const u = usage.get(item.id);
        const isDeployed = (u?.slots ?? 0) > 0;
        const usedIn = (u?.rowIds ?? []).filter(id => rowIndex.has(id));
        const badge = SOURCE_BADGE[item.source] ?? SOURCE_BADGE.manual;
        return (
            <Draggable key={item.id} item={item}>
                <div className={`group relative p-3 rounded-lg border transition-colors ${COPY_TYPE[item.type].border} ${isDeployed ? 'bg-accent-success/5' : 'bg-background-tertiary'}`}>
                    <p className="text-sm text-foreground pr-16 line-clamp-3 whitespace-pre-wrap">{item.text}</p>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${badge.className}`}>{badge.label}</span>
                        <span className={`text-[10px] font-medium uppercase ${COPY_TYPE[item.type].text}`}>{COPY_TYPE[item.type].label}</span>
                        {usedIn.length > 0 && (
                            <span className="flex items-center gap-1 text-[10px] text-foreground-subtle">
                                In
                                {usedIn.slice(0, USED_IN_MAX).map(id => {
                                    const i = rowIndex.get(id)!;
                                    const label = rowLabel(rows[i], i);
                                    return (
                                        <button
                                            key={id}
                                            onMouseDown={e => e.stopPropagation()}
                                            onClick={e => { e.stopPropagation(); onTargetRow(id); }}
                                            title={`Go to ${label}`}
                                            className={`px-1 rounded font-medium tabular-nums transition-colors ${id === targetRowId
                                                ? 'bg-purple-500/25 text-purple-200'
                                                : 'bg-background text-foreground-muted hover:text-foreground'}`}
                                        >
                                            {String(i + 1).padStart(2, '0')}
                                        </button>
                                    );
                                })}
                                {usedIn.length > USED_IN_MAX && (
                                    <span title={usedIn.slice(USED_IN_MAX).map(id => rowLabel(rows[rowIndex.get(id)!], rowIndex.get(id)!)).join('\n')}>
                                        +{usedIn.length - USED_IN_MAX}
                                    </span>
                                )}
                            </span>
                        )}
                        {target && (
                            <span className="ml-auto">
                                <UseButton item={item} target={target} onResult={r => showUseNote(item.id, r)} />
                            </span>
                        )}
                    </div>
                    <UseNote note={useNote} id={item.id} />

                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {onRiff && (
                            <button
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => onRiff(item)}
                                className="p-1.5 rounded hover:bg-purple-500/20 transition-colors"
                                title="Riff on this: write variations for the selected ad"
                                aria-label="Riff on this"
                            >
                                <Sparkles className="w-3 h-3 text-purple-300" />
                            </button>
                        )}
                        <button
                            onClick={() => setEditingItem(item)}
                            className="p-1.5 rounded hover:bg-background transition-colors"
                            title={isDeployed ? 'Edit everywhere (ads where it was customized keep their text)' : 'Edit'}
                            aria-label="Edit"
                        >
                            <Pencil className="w-3 h-3 text-foreground-muted" />
                        </button>
                        <button
                            onClick={() => onRemove(item.id)}
                            className="p-1.5 rounded hover:bg-accent-error/20 transition-colors"
                            title="Remove from Active"
                            aria-label="Remove from Active"
                        >
                            <X className="w-3 h-3 text-accent-error" />
                        </button>
                    </div>
                </div>
            </Draggable>
        );
    };

    return (
        <div>
            {/* Controls */}
            <div className="px-3 py-2 border-b border-border/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-foreground-subtle">
                        <span className="text-accent-success">{inUseCount} in use</span>
                        {unusedTotal > 0 && <> · {unusedTotal} unused</>}
                    </span>
                    <select
                        value={view.sort}
                        onChange={e => set({ sort: e.target.value as ActiveSort })}
                        aria-label="Sort"
                        className="h-7 px-1.5 rounded-md bg-background-tertiary border border-border text-[11px] text-foreground focus:outline-none focus:border-purple-400"
                    >
                        {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <TypeFilterToggle
                        value={view.type}
                        onChange={type => set({ type })}
                        headlineCount={headlineCount}
                        primaryTextCount={primaryTextCount}
                    />
                    <button
                        onClick={() => set({ thisAd: !view.thisAd })}
                        disabled={!targetRowId}
                        aria-pressed={thisAd}
                        title={target?.label ? `Only copy in ${target.label}` : 'Select an ad first'}
                        className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors disabled:opacity-40 ${thisAd
                            ? 'bg-purple-500/25 text-purple-200'
                            : 'bg-background-tertiary text-foreground-muted hover:text-foreground'}`}
                    >
                        <Target className="w-3 h-3" /> This ad
                    </button>
                </div>

                <div className="flex items-center flex-wrap gap-1" role="group" aria-label="Source">
                    {SOURCES.map(s => (
                        <button
                            key={s.id}
                            onClick={() => set({ source: s.id })}
                            aria-pressed={view.source === s.id}
                            className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${view.source === s.id
                                ? 'border-foreground-muted bg-background text-foreground'
                                : 'border-border text-foreground-muted hover:text-foreground'}`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {showSearch && (
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-subtle" />
                        <input
                            value={view.query}
                            onChange={e => set({ query: e.target.value })}
                            placeholder="Search copy"
                            aria-label="Search copy"
                            className="w-full h-8 pl-7 pr-7 rounded-lg bg-background-tertiary border border-border text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-purple-400"
                        />
                        {view.query && (
                            <button
                                onClick={() => set({ query: '' })}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-foreground-subtle hover:text-foreground"
                                aria-label="Clear search"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* In use */}
            {inUse.length > 0 ? (
                <div className="p-2 space-y-2">{inUse.map(renderCard)}</div>
            ) : (
                <div className="px-4 py-6 text-center text-foreground-subtle text-sm">
                    {filtered ? 'Nothing matches' : 'Nothing is in an ad right now'}
                    {filtered && (
                        <button
                            onClick={() => onViewChange({ ...DEFAULT_ACTIVE_VIEW, sort: view.sort, showUnused: view.showUnused })}
                            className="block mx-auto mt-1 text-xs text-purple-300 hover:text-purple-200"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            )}

            {/* Unused: in no ad, tucked away */}
            {!thisAd && unused.length > 0 && (
                <UnusedSection
                    count={unused.length}
                    open={view.showUnused}
                    onToggle={() => set({ showUnused: !view.showUnused })}
                    onClear={() => onRemoveMany(unused.map(i => i.id))}
                >
                    {unused.map(renderCard)}
                </UnusedSection>
            )}

            <CopyEditorModal
                onClose={() => setEditingItem(null)}
                editItem={editingItem}
                onSave={handleEditSave}
                deployedCount={editingItem ? (usage.get(editingItem.id)?.slots ?? 0) : 0}
            />
        </div>
    );
}

/** Collapsed list of copy in no ad, with a two-click Clear. */
function UnusedSection({ count, open, onToggle, onClear, children }: {
    count: number;
    open: boolean;
    onToggle: () => void;
    onClear: () => void;
    children: React.ReactNode;
}) {
    const [confirming, setConfirming] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const clear = () => {
        if (timer.current) clearTimeout(timer.current);
        if (confirming) {
            setConfirming(false);
            onClear();
            return;
        }
        setConfirming(true);
        timer.current = setTimeout(() => setConfirming(false), 3000);
    };

    return (
        <div className="border-t border-border/50">
            <div className="flex items-center justify-between px-3 py-2">
                <button
                    onClick={onToggle}
                    aria-expanded={open}
                    className="flex items-center gap-1 text-xs font-medium text-foreground-muted hover:text-foreground"
                >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
                    Unused ({count})
                </button>
                {open && (
                    <button
                        onClick={clear}
                        title="Remove copy that isn't in any ad"
                        className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${confirming
                            ? 'bg-accent-error/20 text-accent-error'
                            : 'text-foreground-subtle hover:text-accent-error'}`}
                    >
                        {confirming ? `Remove ${count}?` : 'Clear unused'}
                    </button>
                )}
            </div>
            {open && <div className="px-2 pb-2 space-y-2 opacity-80">{children}</div>}
        </div>
    );
}
