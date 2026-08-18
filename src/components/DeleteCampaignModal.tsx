'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteCampaignModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    campaignName: string;
}

export function DeleteCampaignModal({
    isOpen,
    onClose,
    onConfirm,
    campaignName,
}: DeleteCampaignModalProps) {
    const [confirmText, setConfirmText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const isMatch = confirmText.trim().toLowerCase() === campaignName.trim().toLowerCase();

    // Reset the confirmation text when the modal opens (state adjustment
    // during render instead of setState-in-effect)
    const [prevOpen, setPrevOpen] = useState(false);
    if (isOpen !== prevOpen) {
        setPrevOpen(isOpen);
        if (isOpen) setConfirmText('');
    }

    // Focus the input after the open animation
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(timer);
    }, [isOpen]);

    const handleConfirm = () => {
        if (isMatch) {
            onConfirm();
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
        if (e.key === 'Enter' && isMatch) {
            handleConfirm();
        }
    };

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
                    className="relative w-[90vw] max-w-md bg-background rounded-2xl border border-red-500/30 shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-red-500/5">
                        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            Delete Campaign
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
                        <p className="text-foreground-muted text-sm">
                            This action <strong className="text-red-400">cannot be undone</strong>. This will permanently delete the campaign and all its data.
                        </p>

                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-foreground">
                                Campaign to delete: <strong className="text-red-400">{campaignName}</strong>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-foreground-muted mb-2">
                                Type <span className="font-mono bg-background-tertiary px-1.5 py-0.5 rounded text-foreground">{campaignName}</span> to confirm
                            </label>
                            <input
                                ref={inputRef}
                                type="text"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="Type campaign name..."
                                className={`w-full px-4 py-3 bg-background-tertiary border-2 rounded-xl text-foreground placeholder:text-foreground-subtle focus:outline-none transition-colors ${confirmText.length > 0
                                        ? isMatch
                                            ? 'border-green-500/50 focus:border-green-500'
                                            : 'border-red-500/50 focus:border-red-500'
                                        : 'border-border focus:border-accent-primary'
                                    }`}
                            />
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
                            onClick={handleConfirm}
                            disabled={!isMatch}
                            className="px-5 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Delete Campaign
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
