'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Type, FileText, Sparkles } from 'lucide-react';
import { CopyItem } from '@/types';

interface CopyEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    // For edit mode - pass existing item
    editItem?: CopyItem | null;
    // Callbacks
    onSave: (text: string, type: 'headline' | 'primary_text') => void;
    // Optional: show deployment info in edit mode
    deployedCount?: number;
}

const CHAR_LIMITS = {
    headline: 40,
    primary_text: 250,
};

export function CopyEditorModal({
    isOpen,
    onClose,
    editItem,
    onSave,
    deployedCount = 0,
}: CopyEditorModalProps) {
    const isEditMode = !!editItem;
    const [text, setText] = useState('');
    const [type, setType] = useState<'headline' | 'primary_text'>('headline');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Reset form when the modal opens or the edited item changes
    // (state adjustment during render instead of setState-in-effect)
    const [prevReset, setPrevReset] = useState<{ open: boolean; item: typeof editItem }>({ open: false, item: null });
    if (isOpen !== prevReset.open || editItem !== prevReset.item) {
        setPrevReset({ open: isOpen, item: editItem });
        if (isOpen) {
            setText(editItem ? editItem.text : '');
            setType(editItem ? editItem.type : 'headline');
        }
    }

    // Focus textarea after the open animation
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => textareaRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, [isOpen]);

    const handleSave = () => {
        if (text.trim()) {
            onSave(text.trim(), type);
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
                            {isEditMode ? (
                                <>
                                    <FileText className="w-5 h-5 text-accent-primary" />
                                    Edit {type === 'headline' ? 'Headline' : 'Primary Text'}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 text-purple-400" />
                                    Add Copy
                                </>
                            )}
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
                        {/* Type selector - only show in create mode */}
                        {!isEditMode && (
                            <div>
                                <label className="block text-sm font-medium text-foreground-muted mb-2">
                                    Copy Type
                                </label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setType('headline')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${type === 'headline'
                                            ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                                            : 'border-border bg-background-tertiary text-foreground-muted hover:border-accent-primary/50'
                                            }`}
                                    >
                                        <Type className="w-4 h-4" />
                                        <span className="font-medium">Headline</span>
                                        <span className="text-xs opacity-60">({CHAR_LIMITS.headline} chars)</span>
                                    </button>
                                    <button
                                        onClick={() => setType('primary_text')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${type === 'primary_text'
                                            ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                                            : 'border-border bg-background-tertiary text-foreground-muted hover:border-accent-primary/50'
                                            }`}
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span className="font-medium">Primary Text</span>
                                        <span className="text-xs opacity-60">({CHAR_LIMITS.primary_text} chars)</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Textarea */}
                        <div>
                            <label className="block text-sm font-medium text-foreground-muted mb-2">
                                {type === 'headline' ? 'Headline Text' : 'Primary Text'}
                            </label>
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
                                    : 'border-border focus:border-accent-primary'
                                    }`}
                                rows={type === 'headline' ? 3 : 6}
                            />
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-foreground-subtle">
                                    {isEditMode && deployedCount > 0 && (
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
                            {isEditMode ? 'Save Changes' : 'Add to Palette'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
