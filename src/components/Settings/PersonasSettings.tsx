'use client';

import React, { useState } from 'react';
import { CustomerPersona } from '@/types';
import { Plus, Edit2, Trash2, Check, Users } from 'lucide-react';

interface PersonasSettingsProps {
    personas: CustomerPersona[];
    onChange: (personas: CustomerPersona[]) => void;
}

const CHAR_LIMITS = {
    name: 50,
    description: 800,
};

export function PersonasSettings({ personas, onChange }: PersonasSettingsProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newPersona, setNewPersona] = useState<Partial<CustomerPersona> | null>(null);

    const handleAdd = () => {
        setNewPersona({
            name: '',
            emoji: '👤',
            description: '',
        });
        setEditingId(null);
    };

    const handleSaveNew = () => {
        if (newPersona?.name?.trim()) {
            const persona: CustomerPersona = {
                id: `persona-${Date.now()}`,
                name: newPersona.name.trim(),
                emoji: newPersona.emoji || '👤',
                description: newPersona.description || '',
                createdAt: new Date(),
            };
            onChange([...personas, persona]);
            setNewPersona(null);
        }
    };

    const handleUpdate = (id: string, updates: Partial<CustomerPersona>) => {
        onChange(personas.map(p => p.id === id ? { ...p, ...updates } : p));
    };

    const handleDelete = (id: string) => {
        onChange(personas.filter(p => p.id !== id));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Customer Personas</h3>
                    <p className="text-sm text-foreground-muted">
                        Target audience profiles for copy personalization
                    </p>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Persona
                </button>
            </div>

            <div className="space-y-4">
                {/* New Persona Form */}
                {newPersona && (
                    <div className="p-4 bg-accent-primary/5 border border-accent-primary/30 rounded-xl space-y-4">
                        <div className="flex gap-3">
                            <div className="space-y-1">
                                <label className="text-xs text-foreground-muted">Emoji</label>
                                <input
                                    type="text"
                                    value={newPersona.emoji || ''}
                                    onChange={(e) => setNewPersona({ ...newPersona, emoji: e.target.value })}
                                    placeholder="👤"
                                    className="w-16 px-3 py-2 bg-background-tertiary border border-border rounded-lg text-center text-xl focus:outline-none focus:border-accent-primary"
                                    maxLength={2}
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <label className="text-xs text-foreground-muted">Persona Name</label>
                                <input
                                    type="text"
                                    value={newPersona.name || ''}
                                    onChange={(e) => setNewPersona({ ...newPersona, name: e.target.value })}
                                    placeholder="e.g., Weekend Adventurer, Morning Coffee Lover"
                                    className="w-full px-4 py-2 bg-background-tertiary border border-border rounded-lg text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <label className="text-xs text-foreground-muted">Description</label>
                                <span className="text-xs text-foreground-muted">
                                    {(newPersona.description || '').length} / {CHAR_LIMITS.description}
                                </span>
                            </div>
                            <textarea
                                value={newPersona.description || ''}
                                onChange={(e) => setNewPersona({ ...newPersona, description: e.target.value })}
                                placeholder="Describe this customer persona in detail - their lifestyle, pain points, motivations, and how they relate to your product..."
                                className="w-full h-32 px-4 py-3 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setNewPersona(null)}
                                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveNew}
                                disabled={!newPersona.name?.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Check className="w-4 h-4" />
                                Add Persona
                            </button>
                        </div>
                    </div>
                )}

                {/* Persona List */}
                {personas.length === 0 && !newPersona ? (
                    <div className="py-12 text-center text-foreground-muted">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No personas yet. Add your first customer persona to get started.</p>
                    </div>
                ) : (
                    personas.map(persona => (
                        <div
                            key={persona.id}
                            className="p-4 bg-background-tertiary border border-border rounded-xl"
                        >
                            {editingId === persona.id ? (
                                /* Edit Mode */
                                <div className="space-y-4">
                                    <div className="flex gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-foreground-muted">Emoji</label>
                                            <input
                                                type="text"
                                                value={persona.emoji || ''}
                                                onChange={(e) => handleUpdate(persona.id, { emoji: e.target.value })}
                                                className="w-16 px-3 py-2 bg-background border border-border rounded-lg text-center text-xl focus:outline-none focus:border-accent-primary"
                                                maxLength={2}
                                            />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <label className="text-xs text-foreground-muted">Persona Name</label>
                                            <input
                                                type="text"
                                                value={persona.name}
                                                onChange={(e) => handleUpdate(persona.id, { name: e.target.value })}
                                                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent-primary"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between">
                                            <label className="text-xs text-foreground-muted">Description</label>
                                            <span className="text-xs text-foreground-muted">
                                                {persona.description.length} / {CHAR_LIMITS.description}
                                            </span>
                                        </div>
                                        <textarea
                                            value={persona.description}
                                            onChange={(e) => handleUpdate(persona.id, { description: e.target.value })}
                                            className="w-full h-32 px-4 py-3 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent-primary resize-none"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors"
                                        >
                                            <Check className="w-4 h-4" />
                                            Done
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-full bg-accent-primary/20 flex items-center justify-center">
                                        <span className="text-2xl">{persona.emoji || '👤'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-foreground">{persona.name}</h4>
                                        {persona.description && (
                                            <p className="text-sm text-foreground-muted mt-1 line-clamp-3">
                                                {persona.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setEditingId(persona.id)}
                                            className="p-2 text-foreground-muted hover:text-foreground hover:bg-background rounded-lg transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(persona.id)}
                                            className="p-2 text-foreground-muted hover:text-accent-error hover:bg-accent-error/10 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
