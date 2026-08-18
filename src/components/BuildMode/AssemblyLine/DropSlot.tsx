'use client';

import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Pencil, AlertTriangle, Layers } from 'lucide-react';
import { CopyItem, SlotItem, META_CHAR_LIMITS } from '@/types';
import { Droppable } from '@/lib/dnd';

interface DropSlotProps {
    slotType: 'headline' | 'primary_text';
    slotIndex: number;
    item: SlotItem | null;
    onDrop: (item: CopyItem) => void;
    onClear: () => void;
    onLocalEdit: (newText: string) => void;
    onApplyToAll?: () => void;  // New prop for Apply to All
    placeholder: string;
    showApplyToAll?: boolean;  // Only show when there are multiple rows
}

export function DropSlot({
    slotType,
    item,
    onDrop,
    onClear,
    onLocalEdit,
    onApplyToAll,
    placeholder,
    showApplyToAll = true,
}: DropSlotProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');

    const displayText = item ? (item.localText ?? item.masterItem.text) : '';
    const charLimit = slotType === 'headline' ? META_CHAR_LIMITS.headline : META_CHAR_LIMITS.primaryText;
    const getWarningState = (text: string) => {
        if (slotType === 'headline') {
            return text.length > META_CHAR_LIMITS.headline ? 'critical' : 'none';
        }
        // Primary text: orange > 125, red > 250
        if (text.length > 250) return 'critical';
        if (text.length > META_CHAR_LIMITS.primaryText) return 'warning';
        return 'none';
    };

    const warningState = getWarningState(displayText);
    const editWarningState = getWarningState(editText);
    const isTruncated = displayText.length > 60 && !isExpanded;

    const getWarningColorClass = (state: 'none' | 'warning' | 'critical') => {
        if (state === 'critical') return 'text-accent-error';
        if (state === 'warning') return 'text-accent-warning';
        return 'text-foreground-subtle';
    };

    const startEdit = () => {
        if (item) {
            setEditText(displayText);
            setIsEditing(true);
        }
    };

    const saveEdit = () => {
        if (item && editText.trim()) {
            const trimmedText = editText.trim();
            // Only mark as customized if different from master
            if (trimmedText !== item.masterItem.text) {
                onLocalEdit(trimmedText);
            } else {
                // Revert to master (clear local override)
                onLocalEdit(item.masterItem.text);
            }
        }
        setIsEditing(false);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditText('');
    };

    return (
        <Droppable
            slotType={slotType}
            onDrop={onDrop}
            isEmpty={!item}
            className="min-h-[40px] relative"
        >
            {item ? (
                <div className="group relative">
                    {/* Editing mode */}
                    {isEditing ? (
                        <div className="p-2">
                            <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        saveEdit();
                                    }
                                    if (e.key === 'Escape') cancelEdit();
                                }}
                                autoFocus
                                className="w-full bg-background text-sm text-foreground resize-none focus:outline-none rounded p-2 border border-accent-primary"
                                rows={3}
                            />
                            <div className="flex items-center justify-between mt-2">
                                <span className={`text-xs ${getWarningColorClass(editWarningState)}`}>
                                    {editText.length}/{charLimit}
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={cancelEdit}
                                        className="px-2 py-1 text-xs text-foreground-muted hover:text-foreground"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={saveEdit}
                                        className="px-2 py-1 text-xs bg-accent-primary hover:bg-accent-primary-hover rounded"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Display mode */
                        <div
                            className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-background/30 rounded transition-colors"
                            onClick={() => isTruncated && setIsExpanded(!isExpanded)}
                        >
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm text-foreground ${isTruncated ? 'line-clamp-1' : ''}`}>
                                    {displayText}
                                </p>

                                {/* Badges row */}
                                <div className="flex items-center gap-2 mt-1">
                                    {/* Customized badge */}
                                    {item.isCustomized && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/20 text-amber-400">
                                            Customized
                                        </span>
                                    )}

                                    {/* Character limit warning */}
                                    {warningState !== 'none' && (
                                        <span className={`flex items-center gap-1 text-[10px] ${getWarningColorClass(warningState)}`}>
                                            <AlertTriangle className="w-3 h-3" />
                                            {displayText.length}/{charLimit}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Actions - inline with the slot content */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {displayText.length > 60 && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsExpanded(!isExpanded);
                                        }}
                                        className="p-1 rounded hover:bg-background transition-colors"
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                    >
                                        {isExpanded ? (
                                            <ChevronUp className="w-3 h-3 text-foreground-muted" />
                                        ) : (
                                            <ChevronDown className="w-3 h-3 text-foreground-muted" />
                                        )}
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        startEdit();
                                    }}
                                    className="p-1 rounded hover:bg-background transition-colors"
                                    title="Edit locally"
                                >
                                    <Pencil className="w-3 h-3 text-foreground-muted" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClear();
                                    }}
                                    className="p-1 rounded hover:bg-accent-error/20 transition-colors"
                                    title="Remove"
                                >
                                    <X className="w-3 h-3 text-accent-error" />
                                </button>
                                {/* Apply to All button - now inline */}
                                {showApplyToAll && onApplyToAll && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onApplyToAll();
                                        }}
                                        className="p-1 rounded bg-accent-primary/20 hover:bg-accent-primary transition-colors"
                                        title={`Apply to all rows`}
                                    >
                                        <Layers className="w-3 h-3 text-accent-primary hover:text-white" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex items-center justify-center px-3 py-2 text-sm text-foreground-subtle">
                    {placeholder}
                </div>
            )}
        </Droppable>
    );
}
