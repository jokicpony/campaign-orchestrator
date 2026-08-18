'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, TrendingUp, Search, X, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { CopyItem } from '@/types';
import { Draggable } from '@/lib/dnd';
import { TypeFilterToggle, TypeFilter } from './TypeFilterToggle';

interface HistoricalWinsProps {
    items: CopyItem[];
    activeItems: CopyItem[];
    onAddToActive: (item: CopyItem) => void;
}

export function HistoricalWins({ items, activeItems, onAddToActive }: HistoricalWinsProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Build a set of active copy texts (normalized) for duplicate detection
    const activeTexts = useMemo(() => {
        return new Set(activeItems.map(item => item.text.trim().toLowerCase()));
    }, [activeItems]);

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
            <div className="px-4 py-8 text-center text-foreground-subtle text-sm">
                Connect Meta API to load top performers
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar + Type Filter */}
            <div className="p-2 border-b border-border/50 space-y-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search copies..."
                        className="w-full pl-8 pr-8 py-2 text-xs rounded-md bg-background-tertiary border border-border/50 focus:border-accent-primary focus:outline-none text-foreground placeholder:text-foreground-subtle"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-background text-foreground-muted hover:text-foreground"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>

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
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredItems.length === 0 ? (
                    <div className="px-4 py-8 text-center text-foreground-subtle text-sm">
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
                                className="group relative p-3 rounded-lg bg-background-tertiary border border-border hover:border-border-hover transition-colors cursor-pointer"
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

                                {/* Metrics badges */}
                                {item.metrics && (
                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
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
                                )}

                                {/* Type badge */}
                                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-background text-foreground-subtle uppercase">
                                    {item.type === 'headline' ? 'H' : 'PT'}
                                </span>

                                {/* Add to Active button / Already-active indicator */}
                                {activeTexts.has(item.text.trim().toLowerCase()) ? (
                                    <div
                                        className="absolute bottom-2 right-2 p-1.5 rounded-md bg-accent-success/20 cursor-default"
                                        title="Already in Active Palette"
                                    >
                                        <Check className="w-3 h-3 text-accent-success" />
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAddToActive({
                                                ...item,
                                                id: `${item.id}-copy-${Date.now()}`,
                                                source: 'historical',
                                            });
                                        }}
                                        className="absolute bottom-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 bg-accent-primary hover:bg-accent-primary-hover transition-all"
                                        title="Add to Active Palette"
                                    >
                                        <Plus className="w-3 h-3 text-white" />
                                    </button>
                                )}
                            </motion.div>
                        </Draggable>
                    ))
                )}
            </div>
        </div>
    );
}
