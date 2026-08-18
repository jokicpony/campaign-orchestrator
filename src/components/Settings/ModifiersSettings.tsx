'use client';

import React, { useState } from 'react';
import { PromptModifier, IterationAction } from '@/types';
import { Sparkles, Wand2 } from 'lucide-react';

interface ModifiersSettingsProps {
    modifiers: PromptModifier[];
    iterationActions: IterationAction[];
    onModifiersChange: (modifiers: PromptModifier[]) => void;
    onIterationActionsChange: (iterationActions: IterationAction[]) => void;
}

const CHAR_LIMITS = {
    label: 50,
    promptInjection: 200,
};

export function ModifiersSettings({
    modifiers,
    iterationActions,
    onModifiersChange,
    onIterationActionsChange,
}: ModifiersSettingsProps) {
    const [editingModifierId, setEditingModifierId] = useState<string | null>(null);
    const [editingActionId, setEditingActionId] = useState<string | null>(null);

    const handleModifierUpdate = (id: string, updates: Partial<PromptModifier>) => {
        onModifiersChange(modifiers.map(m => m.id === id ? { ...m, ...updates } : m));
    };

    const handleActionUpdate = (id: string, updates: Partial<IterationAction>) => {
        onIterationActionsChange(iterationActions.map(a => a.id === id ? { ...a, ...updates } : a));
    };

    return (
        <div className="space-y-10">
            {/* Generation Modifiers Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Generation Modifiers</h3>
                        <p className="text-sm text-foreground-muted">
                            Creative directions for generating new copy (max 2 active per generation)
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {modifiers.map((modifier, index) => (
                        <div
                            key={modifier.id}
                            className={`p-3 rounded-xl border transition-colors ${editingModifierId === modifier.id
                                    ? 'bg-purple-500/10 border-purple-500/30'
                                    : 'bg-background-tertiary border-border hover:border-purple-500/30'
                                }`}
                        >
                            {editingModifierId === modifier.id ? (
                                /* Edit Mode */
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={modifier.emoji}
                                            onChange={(e) => handleModifierUpdate(modifier.id, { emoji: e.target.value })}
                                            className="w-10 h-10 text-center text-xl bg-background border border-border rounded-lg focus:outline-none focus:border-purple-500"
                                        />
                                        <input
                                            type="text"
                                            value={modifier.label}
                                            onChange={(e) => handleModifierUpdate(modifier.id, { label: e.target.value })}
                                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-purple-500"
                                            placeholder="Label"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] text-foreground-subtle">Prompt Injection</span>
                                            <span className="text-[10px] text-foreground-subtle">
                                                {modifier.promptInjection.length}/{CHAR_LIMITS.promptInjection}
                                            </span>
                                        </div>
                                        <textarea
                                            value={modifier.promptInjection}
                                            onChange={(e) => handleModifierUpdate(modifier.id, { promptInjection: e.target.value })}
                                            className="w-full h-20 px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-purple-500 resize-none"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setEditingModifierId(null)}
                                        className="w-full py-1.5 bg-purple-500 text-white rounded-lg text-xs font-medium hover:bg-purple-600 transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            ) : (
                                /* View Mode */
                                <button
                                    onClick={() => setEditingModifierId(modifier.id)}
                                    className="w-full text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">{modifier.emoji}</span>
                                        <span className="font-medium text-sm text-foreground">{modifier.label}</span>
                                        <span className="text-[10px] text-foreground-subtle ml-auto">#{index + 1}</span>
                                    </div>
                                    <p className="text-xs text-foreground-muted line-clamp-2">
                                        {modifier.promptInjection}
                                    </p>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Iteration Actions Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                        <Wand2 className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-foreground">Iteration Actions</h3>
                        <p className="text-sm text-foreground-muted">
                            Refinement operations for iterating on existing copy
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {iterationActions.map((action, index) => (
                        <div
                            key={action.id}
                            className={`p-3 rounded-xl border transition-colors ${editingActionId === action.id
                                    ? 'bg-amber-500/10 border-amber-500/30'
                                    : 'bg-background-tertiary border-border hover:border-amber-500/30'
                                }`}
                        >
                            {editingActionId === action.id ? (
                                /* Edit Mode */
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={action.emoji}
                                            onChange={(e) => handleActionUpdate(action.id, { emoji: e.target.value })}
                                            className="w-10 h-10 text-center text-xl bg-background border border-border rounded-lg focus:outline-none focus:border-amber-500"
                                        />
                                        <input
                                            type="text"
                                            value={action.label}
                                            onChange={(e) => handleActionUpdate(action.id, { label: e.target.value })}
                                            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-amber-500"
                                            placeholder="Label"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <span className="text-[10px] text-foreground-subtle">Prompt Injection</span>
                                            <span className="text-[10px] text-foreground-subtle">
                                                {action.promptInjection.length}/{CHAR_LIMITS.promptInjection}
                                            </span>
                                        </div>
                                        <textarea
                                            value={action.promptInjection}
                                            onChange={(e) => handleActionUpdate(action.id, { promptInjection: e.target.value })}
                                            className="w-full h-20 px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-amber-500 resize-none"
                                        />
                                    </div>
                                    <button
                                        onClick={() => setEditingActionId(null)}
                                        className="w-full py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors"
                                    >
                                        Done
                                    </button>
                                </div>
                            ) : (
                                /* View Mode */
                                <button
                                    onClick={() => setEditingActionId(action.id)}
                                    className="w-full text-left"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">{action.emoji}</span>
                                        <span className="font-medium text-sm text-foreground">{action.label}</span>
                                        <span className="text-[10px] text-foreground-subtle ml-auto">#{index + 1}</span>
                                    </div>
                                    <p className="text-xs text-foreground-muted line-clamp-2">
                                        {action.promptInjection}
                                    </p>
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <p className="text-xs text-foreground-subtle">
                    💡 The custom text input will always be available as the 6th option when iterating.
                </p>
            </div>
        </div>
    );
}
