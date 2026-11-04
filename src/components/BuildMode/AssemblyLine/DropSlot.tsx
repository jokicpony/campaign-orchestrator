'use client';

import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Pencil, AlertTriangle, Layers } from 'lucide-react';
import { CopyItem, SlotItem, META_CHAR_LIMITS } from '@/types';
import { Droppable } from '@/lib/dnd';
import { COPY_TYPE } from '@/components/copyType';

interface DropSlotProps {
    slotType: 'headline' | 'primary_text';
    slotIndex: number;
    item: SlotItem | null;
    onDrop: (item: CopyItem) => void;
    onClear: () => void;
    onLocalEdit: (newText: string) => void;
    onTypeNew?: (text: string) => void;  // Write your own copy straight into an empty slot
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
    onTypeNew,
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
        // Primary text: red past Meta's maximum; past "See more" (125) is just noted, since long reads are on purpose
        if (text.length > META_CHAR_LIMITS.primaryTextMax) return 'critical';
        if (text.length > META_CHAR_LIMITS.primaryText) return 'info';
        return 'none';
    };

    const warningState = getWarningState(displayText);
    const editWarningState = getWarningState(editText);
    // Long copy shows two lines until clicked (the hover actions float over it, so they take no width)
    const isLong = displayText.length > 90;
    const isTruncated = isLong && !isExpanded;

    const getWarningColorClass = (state: 'none' | 'info' | 'critical') => {
        if (state === 'critical') return 'text-accent-error';
        return 'text-foreground-subtle';
    };

    const startEdit = () => {
        if (item) {
            setEditText(displayText);
            setIsEditing(true);
        }
    };

    const startNew = () => {
        setEditText('');
        setIsEditing(true);
    };

    const saveEdit = () => {
        if (!item) {
            if (editText.trim()) onTypeNew?.(editText.trim());
            setIsEditing(false);
            setEditText('');
            return;
        }
        if (editText.trim()) {
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
                        placeholder={item ? undefined : `Write ${slotType === 'headline' ? 'a headline' : 'primary text'}…`}
                        className={`w-full bg-background text-sm text-foreground resize-none focus:outline-none rounded p-2 border ${COPY_TYPE[slotType].strong}`}
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
            ) : item ? (
                <div className="group relative">
                    {/* The copy type's color, as everywhere copy shows */}
                    <span aria-hidden className={`absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full ${COPY_TYPE[slotType].bar}`} />
                    <div
                        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-background/30 rounded transition-colors"
                        onClick={() => isTruncated && setIsExpanded(!isExpanded)}
                    >
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm text-foreground whitespace-pre-wrap ${isTruncated ? 'line-clamp-2' : ''}`}>
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
                                {warningState === 'critical' && (
                                    <span
                                        className={`flex items-center gap-1 text-[10px] ${getWarningColorClass(warningState)}`}
                                        title={`Over Meta's limit of ${slotType === 'headline' ? META_CHAR_LIMITS.headline : META_CHAR_LIMITS.primaryTextMax} characters`}
                                    >
                                        <AlertTriangle className="w-3 h-3" />
                                        {displayText.length}/{slotType === 'headline' ? charLimit : META_CHAR_LIMITS.primaryTextMax}
                                    </span>
                                )}
                                {warningState === 'info' && (
                                    <span className="text-[10px] text-foreground-subtle" title={`Meta shows about ${META_CHAR_LIMITS.primaryText} characters before "See more"`}>
                                        {displayText.length >= 500 ? `Long read · ${displayText.length} chars` : `${displayText.length} chars · See more`}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions float over the text on hover, so the text keeps the full width */}
                        <div className="absolute right-1 top-1 flex items-center gap-1 p-0.5 rounded-md bg-background-secondary/95 shadow-sm opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
                            {isLong && (
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
                </div>
            ) : onTypeNew ? (
                <button
                    type="button"
                    onClick={startNew}
                    title="Click to write your own, or drag copy here"
                    className="group w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-foreground-subtle hover:text-foreground-muted transition-colors"
                >
                    <span>{placeholder}</span>
                    <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            ) : (
                <div className="flex items-center justify-center px-3 py-2 text-sm text-foreground-subtle">
                    {placeholder}
                </div>
            )}
        </Droppable>
    );
}
