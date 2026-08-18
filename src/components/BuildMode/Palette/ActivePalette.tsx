'use client';

import React, { useState, useMemo } from 'react';
import { motion, Reorder } from 'framer-motion';
import { X, GripVertical, Pencil, Hash, Plus } from 'lucide-react';
import { CopyItem } from '@/types';
import { Draggable } from '@/lib/dnd';
import { CopyEditorModal } from './CopyEditorModal';
import { TypeFilterToggle, TypeFilter } from './TypeFilterToggle';

interface ActivePaletteProps {
    items: CopyItem[];
    onRemove: (id: string) => void;
    onEdit: (id: string, newText: string) => void;
    onAdd?: (text: string, type: 'headline' | 'primary_text') => void;
    usageCounts?: Map<string, number>;
}

export function ActivePalette({ items, onRemove, onEdit, onAdd, usageCounts }: ActivePaletteProps) {
    const [editingItem, setEditingItem] = useState<CopyItem | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

    // Count by type
    const headlineCount = useMemo(() => items.filter(i => i.type === 'headline').length, [items]);
    const primaryTextCount = useMemo(() => items.filter(i => i.type === 'primary_text').length, [items]);

    // Filter and sort items
    const displayItems = useMemo(() => {
        let result = items;

        // Type filter
        if (typeFilter !== 'all') {
            result = result.filter(item => item.type === typeFilter);
        }

        // Sort by usage count (most used first)
        if (usageCounts) {
            result = [...result].sort((a, b) => {
                const countA = usageCounts.get(a.id) || 0;
                const countB = usageCounts.get(b.id) || 0;
                return countB - countA;
            });
        }

        return result;
    }, [items, usageCounts, typeFilter]);

    const handleEditSave = (text: string) => {
        if (editingItem) {
            onEdit(editingItem.id, text);
        }
        setEditingItem(null);
    };

    const handleAddSave = (text: string, type: 'headline' | 'primary_text') => {
        onAdd?.(text, type);
        setIsAddModalOpen(false);
    };

    // Count how many are deployed (usage > 0)
    const deployedCount = usageCounts
        ? Array.from(usageCounts.values()).filter(c => c > 0).length
        : 0;

    const editingItemUsageCount = editingItem ? (usageCounts?.get(editingItem.id) || 0) : 0;

    return (
        <div>
            {/* Header with Type Filter + Add button */}
            <div className="px-3 py-2 border-b border-border/50 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground-subtle">
                        {items.length > 0 ? (
                            <>
                                {usageCounts && deployedCount > 0 ? (
                                    <><span className="text-accent-success">{deployedCount} deployed</span></>
                                ) : (
                                    `${items.length} item${items.length !== 1 ? 's' : ''}`
                                )}
                            </>
                        ) : (
                            'Drag items here or add manually'
                        )}
                    </span>
                    {onAdd && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            Add
                        </button>
                    )}
                </div>

                {/* Type Filter - only show when there are items */}
                {items.length > 0 && (
                    <TypeFilterToggle
                        value={typeFilter}
                        onChange={setTypeFilter}
                        headlineCount={headlineCount}
                        primaryTextCount={primaryTextCount}
                    />
                )}
            </div>

            {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <p className="text-foreground-subtle text-sm">
                        Your copy ingredients will appear here
                    </p>
                    <p className="text-foreground-subtle text-xs mt-1">
                        Drag from Top Performers, generate with AI, or add your own
                    </p>
                    {onAdd && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Your Own Copy
                        </button>
                    )}
                </div>
            ) : displayItems.length === 0 ? (
                <div className="px-4 py-8 text-center text-foreground-subtle text-sm">
                    No {typeFilter === 'headline' ? 'headlines' : 'primary texts'} in palette
                </div>
            ) : (
                <Reorder.Group axis="y" values={displayItems} onReorder={() => { }} className="p-2 space-y-2">
                    {displayItems.map((item) => {
                        const usageCount = usageCounts?.get(item.id) || 0;
                        const isDeployed = usageCount > 0;

                        return (
                            <Reorder.Item key={item.id} value={item}>
                                <Draggable item={item}>
                                    <motion.div
                                        layout
                                        className={`group relative p-3 rounded-lg border transition-colors ${isDeployed
                                            ? 'bg-accent-success/5 border-accent-success/30 hover:border-accent-success'
                                            : 'bg-background-tertiary border-border hover:border-accent-primary/50'
                                            }`}
                                    >
                                        {/* Drag handle */}
                                        <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                                            <GripVertical className="w-4 h-4 text-foreground-subtle" />
                                        </div>

                                        {/* Copy text */}
                                        <p className="text-sm text-foreground pl-4 pr-16 line-clamp-3">
                                            {item.text}
                                        </p>

                                        {/* Source badge + Usage count */}
                                        <div className="flex items-center gap-2 mt-2 pl-4">
                                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase ${item.source === 'ai_generated'
                                                ? 'bg-purple-500/20 text-purple-400'
                                                : item.source === 'historical'
                                                    ? 'bg-accent-success/20 text-accent-success'
                                                    : 'bg-foreground-subtle/20 text-foreground-subtle'
                                                }`}>
                                                {item.source === 'ai_generated' ? 'AI' : item.source === 'historical' ? 'Winner' : 'Manual'}
                                            </span>
                                            <span className="text-[10px] text-foreground-subtle uppercase">
                                                {item.type === 'headline' ? 'Headline' : 'Primary Text'}
                                            </span>

                                            {/* Usage count badge */}
                                            {isDeployed && (
                                                <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent-primary/20 text-accent-primary">
                                                    <Hash className="w-2.5 h-2.5" />
                                                    {usageCount} slot{usageCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditingItem(item)}
                                                className="p-1.5 rounded hover:bg-background transition-colors"
                                                title={isDeployed ? 'Edit globally (updates all non-customized slots)' : 'Edit'}
                                            >
                                                <Pencil className="w-3 h-3 text-foreground-muted" />
                                            </button>
                                            <button
                                                onClick={() => onRemove(item.id)}
                                                className="p-1.5 rounded hover:bg-accent-error/20 transition-colors"
                                            >
                                                <X className="w-3 h-3 text-accent-error" />
                                            </button>
                                        </div>
                                    </motion.div>
                                </Draggable>
                            </Reorder.Item>
                        );
                    })}
                </Reorder.Group>
            )}

            {/* Edit Modal */}
            <CopyEditorModal
                isOpen={!!editingItem}
                onClose={() => setEditingItem(null)}
                editItem={editingItem}
                onSave={handleEditSave}
                deployedCount={editingItemUsageCount}
            />

            {/* Add Modal */}
            <CopyEditorModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleAddSave}
            />
        </div>
    );
}
