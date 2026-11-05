'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { META_CHAR_LIMITS, type CopyItem } from '@/types';
import { COPY_TYPE } from '@/components/copyType';

interface CopyEditorModalProps {
    onClose: () => void;
    /** The Active card being edited; the modal is open while this is set. */
    editItem: CopyItem | null;
    onSave: (text: string) => void;
    /** How many row slots use it (an edit updates the ones not customized). */
    deployedCount?: number;
}

const CHAR_LIMITS = {
    headline: META_CHAR_LIMITS.headline,
    primary_text: META_CHAR_LIMITS.primaryTextMax,
};

/** Edit an Active card. New copy is written in the Copy tab's Write your own. */
export function CopyEditorModal({
    onClose,
    editItem,
    onSave,
    deployedCount = 0,
}: CopyEditorModalProps) {
    const isOpen = !!editItem;
    const type = editItem?.type ?? 'headline';
    const [text, setText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load the item's text when it changes (state adjustment during render instead of setState-in-effect)
    const [prevItem, setPrevItem] = useState<CopyItem | null>(null);
    if (editItem !== prevItem) {
        setPrevItem(editItem);
        if (editItem) setText(editItem.text);
    }

    // Focus textarea after the open animation
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => textareaRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, [isOpen]);

    const handleSave = () => {
        if (text.trim()) {
            onSave(text.trim());
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    };

    const charLimit = CHAR_LIMITS[type];
    const isOverLimit = text.length > charLimit;
    const charCountColor = isOverLimit ? 'text-red-400' : text.length > charLimit * 0.8 ? 'text-amber-400' : 'text-foreground-muted';
    const style = COPY_TYPE[type];

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    className="relative w-[90vw] max-w-xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background-secondary">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <style.icon className={`w-5 h-5 ${style.text}`} />
                            Edit {style.label.toLowerCase()}
                        </h2>
                        <button
                            onClick={onClose}
                            className="p-2 text-foreground-muted hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-5 space-y-4">
                        {/* Textarea */}
                        <div>
                            <textarea
                                ref={textareaRef}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder={type === 'headline'
                                    ? "Write a punchy, attention-grabbing headline..."
                                    : "Write engaging body copy that connects with your audience..."
                                }
                                className={`w-full p-4 bg-background-tertiary border-2 rounded-xl text-foreground placeholder:text-foreground-subtle focus:outline-none transition-colors resize-none ${isOverLimit
                                    ? 'border-red-500/50 focus:border-red-500'
                                    : `border-border ${style.focus}`
                                    }`}
                                rows={type === 'headline' ? 3 : 6}
                            />
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-foreground-subtle">
                                    {deployedCount > 0 && (
                                        <span className="text-accent-primary">
                                            Deployed to {deployedCount} slot{deployedCount !== 1 ? 's' : ''} •
                                        </span>
                                    )}
                                    <span className="opacity-60">⌘+Enter to save</span>
                                </span>
                                <span className={`text-xs font-medium ${charCountColor}`}>
                                    {text.length} / {charLimit}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border bg-background-secondary">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!text.trim()}
                            className="px-5 py-2 text-sm font-medium bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save changes
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
