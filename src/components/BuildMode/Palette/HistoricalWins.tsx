'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Search, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { CopyItem } from '@/types';
import { Draggable } from '@/lib/dnd';
import { TypeFilterToggle, TypeFilter } from './TypeFilterToggle';
import { UseButton, UseNote, useUseNote, type CopyTarget } from '../CopyTarget';
import { COPY_TYPE } from '@/components/copyType';

interface HistoricalWinsProps {
    items: CopyItem[];
    onRiff?: (item: CopyItem) => void;
    /** The selected ad: Use adds a card to it. */
    target?: CopyTarget;
    /** Buttons beside the search box (Import, Clear). */
    actions?: React.ReactNode;
    /** Shown under the search row: the import options and the last import's result. */
    below?: React.ReactNode;
    /** What to say when there are no top performers yet. */
    emptyHint?: string;
}

export function HistoricalWins({ items, onRiff, target, actions, below, emptyHint }: HistoricalWinsProps) {
    const [useNote, showUseNote] = useUseNote();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Toggle expansion of an item
    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Count by type
    const headlineCount = useMemo(() => items.filter(i => i.type === 'headline').length, [items]);
    const primaryTextCount = useMemo(() => items.filter(i => i.type === 'primary_text').length, [items]);

    // Filter items by search query and type
    const filteredItems = useMemo(() => {
        let result = items;

        // Type filter
        if (typeFilter !== 'all') {
            result = result.filter(item => item.type === typeFilter);
        }

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(item => item.text.toLowerCase().includes(query));
        }

        return result;
    }, [items, searchQuery, typeFilter]);

    if (items.length === 0) {
        return (
            <div className="px-4 py-8 space-y-3 text-center">
                <p className="text-sm text-foreground-muted">No top performers yet</p>
                {emptyHint && <p className="text-xs text-foreground-subtle">{emptyHint}</p>}
                {actions && <div className="flex justify-center gap-1.5">{actions}</div>}
                {below && <div className="text-left">{below}</div>}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar + Type Filter */}
            <div className="p-2 border-b border-border/50 space-y-2">
                <div className="flex items-center gap-1.5">
                    <div className="relative flex-1 min-w-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search top performers"
                            aria-label="Search top performers"
                            className="w-full h-8 pl-8 pr-8 text-xs rounded-md bg-background-tertiary border border-border/50 focus:border-accent-primary focus:outline-none text-foreground placeholder:text-foreground-subtle"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background text-foreground-muted hover:text-foreground"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {actions}
                </div>
                {below}

                {/* Type Filter */}
                <TypeFilterToggle
                    value={typeFilter}
                    onChange={setTypeFilter}
                    headlineCount={headlineCount}
                    primaryTextCount={primaryTextCount}
                />

                {(searchQuery || typeFilter !== 'all') && (
                    <p className="text-[10px] text-foreground-subtle px-1">
                        {filteredItems.length} of {items.length} copies
                    </p>
                )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-1 @2xl/palette:grid-cols-2 gap-2 content-start">
                {filteredItems.length === 0 ? (
                    <div className="col-span-full px-4 py-8 text-center text-foreground-subtle text-sm">
                        {searchQuery ? `No copies match "${searchQuery}"` : 'No items match filter'}
                    </div>
                ) : (
                    filteredItems.map((item, index) => (
                        <Draggable key={item.id} item={item}>
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.02 }}
                                onClick={() => toggleExpand(item.id)}
                                className={`group relative p-3 rounded-lg bg-background-tertiary border ${COPY_TYPE[item.type].border} transition-colors cursor-pointer`}
                            >
                                {/* Copy text - expandable */}
                                <p className={`text-sm text-foreground pr-8 ${expandedIds.has(item.id) ? '' : 'line-clamp-2'}`}>
                                    {item.text}
                                </p>

                                {/* Expand/collapse hint - only show on long text */}
                                {item.text.length > 80 && (
                                    <div className="flex items-center justify-center mt-1">
                                        {expandedIds.has(item.id) ? (
                                            <ChevronUp className="w-3 h-3 text-foreground-muted" />
                                        ) : (
                                            <ChevronDown className="w-3 h-3 text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                        )}
                                    </div>
                                )}

                                {/* Type badge */}
                                <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${COPY_TYPE[item.type].badge}`} title={COPY_TYPE[item.type].label}>
                                    {COPY_TYPE[item.type].short}
                                </span>

                                {/* Metrics on the left; Riff, Active and Use on the right */}
                                <div className="flex items-end justify-between gap-2 mt-2">
                                    {item.metrics ? (
                                        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
                                            <TrendingUp className="w-3 h-3 text-accent-success flex-shrink-0" />
                                            {item.metrics.spend !== undefined && item.metrics.spend > 0 && (
                                                <span className="text-xs text-foreground-subtle font-medium">
                                                    ${item.metrics.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} spent
                                                </span>
                                            )}
                                            {item.metrics.ctr !== undefined && item.metrics.ctr > 0 && (
                                                <span className="text-xs text-foreground-subtle">
                                                    {item.metrics.ctr.toFixed(2)}% CTR
                                                </span>
                                            )}
                                            {item.metrics.roas !== undefined && item.metrics.roas > 0 && (
                                                <span className="text-xs text-accent-success font-medium">
                                                    {item.metrics.roas.toFixed(1)}x ROAS
                                                </span>
                                            )}
                                        </div>
                                    ) : <span />}

                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* Riff on this: the copywriter writes variations for the selected ad */}
                                        {onRiff && (
                                            <button
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { e.stopPropagation(); onRiff(item); }}
                                                className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 bg-purple-500/20 hover:bg-purple-500/40 transition-all"
                                                title="Riff on this: write variations for the selected ad"
                                                aria-label="Riff on this"
                                            >
                                                <Sparkles className="w-3 h-3 text-purple-300" />
                                            </button>
                                        )}

                                        {target && <UseButton item={item} target={target} onResult={r => showUseNote(item.id, r)} />}
                                    </div>
                                </div>
                                <UseNote note={useNote} id={item.id} />
                            </motion.div>
                        </Draggable>
                    ))
                )}
            </div>
        </div>
    );
}
