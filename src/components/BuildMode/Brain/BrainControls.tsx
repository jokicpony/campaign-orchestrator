'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Package, Users, Info } from 'lucide-react';
import { BrainConfig, PromptModifier, Product, CustomerPersona, BUILT_IN_MODIFIERS } from '@/types';
import { PlaceholderCycler } from './PlaceholderCycler';

// ─── FieldHint ───────────────────────────────────────────────────────
// Two-step reveal: hover shows a brief nudge ("Click for tips"),
// click opens the full guidance panel with description + optional examples.

interface FieldHintProps {
    description: string;
    examples?: string[];
}

function FieldHint({ description, examples }: FieldHintProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div ref={containerRef} className="relative inline-flex items-center ml-1.5">
            {/* Icon trigger */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                className={`p-0.5 rounded-md transition-colors ${
                    isOpen
                        ? 'text-purple-400'
                        : 'text-foreground-subtle/50 hover:text-purple-400'
                }`}
                aria-label="Show tips"
            >
                <Info className="w-3.5 h-3.5" />
            </button>

            {/* Hover tooltip — brief nudge */}
            <AnimatePresence>
                {isHovered && !isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 2 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 px-2 py-1 rounded bg-black/90 text-[10px] text-white whitespace-nowrap pointer-events-none"
                    >
                        Click for tips
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expanded panel — full guidance */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute left-0 top-full mt-2 z-50 w-72 p-3 rounded-lg bg-[#1a1a2e] border border-purple-500/30 shadow-xl shadow-purple-500/10"
                    >
                        <p className="text-xs text-foreground-subtle leading-relaxed">
                            {description}
                        </p>
                        {examples && examples.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-white/5">
                                <p className="text-[10px] text-purple-400/80 font-medium mb-1.5 uppercase tracking-wider">
                                    Examples
                                </p>
                                <ul className="space-y-1">
                                    {examples.map((ex, i) => (
                                        <li key={i} className="text-[11px] text-foreground-muted/80 italic pl-2 border-l border-purple-500/30">
                                            &ldquo;{ex}&rdquo;
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Hint copy ───────────────────────────────────────────────────────

const FIELD_HINTS = {
    product: {
        description: 'Select the product this ad is for. Its unique selling points will be automatically woven into the generated copy.',
    },
    persona: {
        description: 'Choose a target customer persona. The AI will tailor tone, language, and pain points to match this audience. Personas can be built and modified in Settings.',
    },
    context: {
        description: 'Describe the specific angle, campaign goal, or situation for this generation. This is also a great place to mention any active promotion or offer. Think: Who is seeing this ad? Why should they care right now? How should they feel when they read the caption? The product USPs and persona are already handled — use this for the unique twist.',
        examples: [
            'Target weekend warriors gearing up for a big event — make it feel like an essential they can\'t show up without',
            'Speak to gift-givers shopping for a holiday — warm, sentimental, but not cheesy',
            'Hit practical buyers who are tired of the cheap version failing them — lead with durability',
            'Re-engage past customers with a new drop — hype and exclusivity',
        ],
    },
    creativity: {
        description: 'Controls how adventurous the AI gets across all generation — including iterations and remixes. Safe keeps it on-brand and predictable; Wild may produce unexpected gems. Remixes always run a notch hotter than your setting.',
    },
    modifiers: {
        description: 'Modifier chips steer the AI\'s writing style. Pick up to 2 to nudge the output — e.g. urgency + question hook. Modifiers can be customized in Settings if you want to change their behavior or explore new ones.',
    },
};

// ─── BrainControls ──────────────────────────────────────────────────

interface BrainControlsProps {
    config: BrainConfig;
    onConfigChange: (updates: Partial<BrainConfig>) => void;
    modifiers?: PromptModifier[];
    products?: Product[];
    personas?: CustomerPersona[];
    onGenerate: (type: 'headline' | 'primary_text' | 'both', count: number) => void;
    isGenerating: boolean;
    disabled?: boolean;
}

const MAX_ACTIVE_MODIFIERS = 2;

export function BrainControls({
    config,
    onConfigChange,
    modifiers = BUILT_IN_MODIFIERS,
    products = [],
    personas = [],
    onGenerate,
    isGenerating,
    disabled = false,
}: BrainControlsProps) {
    const selectedProduct = products.find(p => p.id === config.selectedProductId);
    const selectedPersona = personas.find(p => p.id === config.selectedPersonaId);

    const toggleModifier = (modifierId: string) => {
        const isActive = config.activeModifiers.includes(modifierId);

        if (isActive) {
            // Remove modifier
            onConfigChange({
                activeModifiers: config.activeModifiers.filter(id => id !== modifierId),
            });
        } else {
            // Add modifier (if under limit)
            if (config.activeModifiers.length < MAX_ACTIVE_MODIFIERS) {
                onConfigChange({
                    activeModifiers: [...config.activeModifiers, modifierId],
                });
            }
        }
    };

    const temperatureLabel = config.temperature < 0.4
        ? 'Safe'
        : config.temperature < 0.7
            ? 'Balanced'
            : 'Experimental';

    const canGenerate = config.context.trim().length > 10 && !isGenerating && !disabled;

    return (
        <div className="space-y-4">
            {/* Product Selector */}
            <div>
                <label className="flex items-center text-sm font-medium text-foreground-subtle mb-2">
                    <Package className="w-4 h-4 inline-block mr-1.5" />
                    Select Product
                    <FieldHint {...FIELD_HINTS.product} />
                </label>
                <select
                    value={config.selectedProductId || ''}
                    onChange={(e) => onConfigChange({ selectedProductId: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm focus:outline-none focus:border-accent-primary"
                >
                    <option value="">No product selected (freeform)</option>
                    {products.map(product => (
                        <option key={product.id} value={product.id}>
                            {product.emoji} {product.name}
                        </option>
                    ))}
                </select>
                {selectedProduct && selectedProduct.usps && (
                    <div className="mt-2 p-2 bg-background rounded-lg border border-border/50">
                        <p className="text-xs text-foreground-muted line-clamp-2">{selectedProduct.usps}</p>
                    </div>
                )}
            </div>

            {/* Persona Selector */}
            {personas.length > 0 && (
                <div>
                    <label className="flex items-center text-sm font-medium text-foreground-subtle mb-2">
                        <Users className="w-4 h-4 inline-block mr-1.5" />
                        Target Persona
                        <FieldHint {...FIELD_HINTS.persona} />
                    </label>
                    <select
                        value={config.selectedPersonaId || ''}
                        onChange={(e) => onConfigChange({ selectedPersonaId: e.target.value || undefined })}
                        className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm focus:outline-none focus:border-accent-primary"
                    >
                        <option value="">No persona selected</option>
                        {personas.map(persona => (
                            <option key={persona.id} value={persona.id}>
                                {persona.emoji || '👤'} {persona.name}
                            </option>
                        ))}
                    </select>
                    {selectedPersona && selectedPersona.description && (
                        <div className="mt-2 p-2 bg-background rounded-lg border border-border/50">
                            <p className="text-xs text-foreground-muted line-clamp-2">{selectedPersona.description}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Context Input */}
            <div>
                <label className="flex items-center text-sm font-medium text-foreground-subtle mb-2">
                    Describe Your Angle
                    <FieldHint {...FIELD_HINTS.context} />
                </label>
                <PlaceholderCycler
                    value={config.context}
                    onChange={(context) => onConfigChange({ context })}
                />
                <p className="text-xs text-foreground-subtle mt-1">
                    {config.context.length} characters • Minimum 10 required
                </p>
            </div>

            {/* Temperature Slider */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center text-sm font-medium text-foreground-subtle">
                        Tune Creativity
                        <FieldHint {...FIELD_HINTS.creativity} />
                    </label>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.temperature < 0.4
                        ? 'bg-blue-500/20 text-blue-400'
                        : config.temperature < 0.7
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                        {temperatureLabel}
                    </span>
                </div>
                <div className="relative">
                    <input
                        type="range"
                        min="0.2"
                        max="1"
                        step="0.1"
                        value={config.temperature}
                        onChange={(e) => onConfigChange({ temperature: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-background-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-foreground-subtle mt-1">
                        <span>🛡️ Safe</span>
                        <span>🎨 Balanced</span>
                        <span>🚀 Wild</span>
                    </div>
                </div>
            </div>

            {/* Modifier Chips */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center text-sm font-medium text-foreground-subtle">
                        Apply Modifiers
                        <FieldHint {...FIELD_HINTS.modifiers} />
                    </label>
                    <span className="text-xs text-foreground-subtle">
                        {config.activeModifiers.length}/{MAX_ACTIVE_MODIFIERS} selected
                    </span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {modifiers.map((modifier) => {
                        const isActive = config.activeModifiers.includes(modifier.id);
                        const isAtLimit = config.activeModifiers.length >= MAX_ACTIVE_MODIFIERS && !isActive;

                        return (
                            <motion.button
                                key={modifier.id}
                                onClick={() => toggleModifier(modifier.id)}
                                disabled={isAtLimit}
                                whileHover={{ scale: isAtLimit ? 1 : 1.02 }}
                                whileTap={{ scale: isAtLimit ? 1 : 0.98 }}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${isActive
                                    ? 'bg-accent-primary text-white'
                                    : isAtLimit
                                        ? 'bg-background-tertiary text-foreground-subtle/40 cursor-not-allowed'
                                        : 'bg-background-tertiary text-foreground hover:bg-background border border-border hover:border-accent-primary/50'
                                    }`}
                                title={isAtLimit ? 'Remove a modifier to add another' : modifier.promptInjection}
                            >
                                <span>{modifier.emoji}</span>
                                <span>{modifier.label}</span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Generate Controls */}
            <div className="flex items-center gap-3 pt-2 pb-4">
                <select
                    className="px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm focus:outline-none focus:border-accent-primary"
                    defaultValue="both-6"
                    id="generation-type"
                >
                    <option value="headline-5">5 Headlines</option>
                    <option value="primary_text-5">5 Primary Texts</option>
                    <option value="both-6">Mix (3 + 3)</option>
                    <option value="headline-10">10 Headlines</option>
                    <option value="primary_text-10">10 Primary Texts</option>
                </select>
                <motion.button
                    onClick={() => {
                        const select = document.getElementById('generation-type') as HTMLSelectElement;
                        const [type, count] = select.value.split('-');
                        onGenerate(type as 'headline' | 'primary_text' | 'both', parseInt(count));
                    }}
                    disabled={!canGenerate}
                    whileHover={{ scale: canGenerate ? 1.02 : 1 }}
                    whileTap={{ scale: canGenerate ? 0.98 : 1 }}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${canGenerate
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg shadow-purple-500/25'
                        : 'bg-background-tertiary text-foreground-subtle cursor-not-allowed'
                        }`}
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Generating...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            <span>Generate</span>
                        </>
                    )}
                </motion.button>
            </div>
        </div>
    );
}
