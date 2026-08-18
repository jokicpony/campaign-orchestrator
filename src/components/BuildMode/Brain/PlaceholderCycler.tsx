'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PLACEHOLDER_SUGGESTIONS } from '@/lib/ai';

interface PlaceholderCyclerProps {
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
}

export function PlaceholderCycler({ value, onChange, onFocus, onBlur }: PlaceholderCyclerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFocused, setIsFocused] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Cycle through suggestions every 4 seconds
    useEffect(() => {
        if (value || isFocused) return; // Don't cycle if user is typing or focused

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % PLACEHOLDER_SUGGESTIONS.length);
        }, 4000);

        return () => clearInterval(interval);
    }, [value, isFocused]);

    const handleFocus = () => {
        setIsFocused(true);
        onFocus?.();
    };

    const handleBlur = () => {
        setIsFocused(false);
        onBlur?.();
    };

    const currentPlaceholder = PLACEHOLDER_SUGGESTIONS[currentIndex];

    return (
        <div className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className="w-full min-h-[100px] p-4 bg-background-tertiary border border-border rounded-lg text-foreground placeholder-transparent focus:outline-none focus:border-accent-primary resize-none transition-colors"
                placeholder=" "
            />
            {/* Animated placeholder overlay */}
            <AnimatePresence mode="wait">
                {!value && !isFocused && (
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.3 }}
                        className="absolute top-4 left-4 right-4 pointer-events-none text-foreground-subtle/60 italic"
                        onClick={() => textareaRef.current?.focus()}
                    >
                        {currentPlaceholder}
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Static placeholder when focused but empty */}
            {!value && isFocused && (
                <div className="absolute top-4 left-4 right-4 pointer-events-none text-foreground-subtle/40">
                    Describe your product, audience, or campaign goal...
                </div>
            )}
        </div>
    );
}
