'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { GlobalPromptSettings, AIProvider, AVAILABLE_AI_MODELS, AI_PROVIDER_INFO } from '@/types';
import { authedFetch } from '@/lib/api/authedFetch';
import { X, Cpu } from 'lucide-react';

type KeyStatus = Record<AIProvider, { userKey: boolean; envKey: boolean }>;

// Secure per-user key manager. Keys are set/cleared via the authenticated
// /api/ai/keys endpoint and stored server-side only (owner-only) — values are
// never returned to the client or written to a client-readable doc.
function ProviderKeyManager() {
    const [status, setStatus] = useState<KeyStatus | null>(null);
    const [editing, setEditing] = useState<AIProvider | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await authedFetch('/api/ai/keys');
            if (res.ok) setStatus((await res.json()).providers);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    const saveKey = async (provider: AIProvider) => {
        if (inputValue.trim().length < 8) return;
        setBusy(true); setError(null);
        try {
            const res = await authedFetch('/api/ai/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, key: inputValue.trim() }),
            });
            if (!res.ok) {
                setError((await res.json().catch(() => ({}))).error || 'Failed to save key');
            } else {
                setEditing(null); setInputValue(''); await load();
            }
        } finally { setBusy(false); }
    };

    const removeKey = async (provider: AIProvider) => {
        setBusy(true); setError(null);
        try {
            const res = await authedFetch('/api/ai/keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider }),
            });
            if (res.ok) await load();
        } finally { setBusy(false); }
    };

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Your API Keys</label>
            <p className="text-xs text-foreground-muted">
                Optional — add your own key per provider. It&apos;s stored securely server-side,
                is private to you, and falls back to the server default when unset.
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {(['google', 'anthropic', 'openai'] as AIProvider[]).map(provider => {
                const info = AI_PROVIDER_INFO[provider];
                const s = status?.[provider];
                const isEditing = editing === provider;
                return (
                    <div key={provider} className="p-3 rounded-lg border border-border bg-background-tertiary">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span>{info.emoji}</span>
                                <span className="text-sm text-foreground">{info.label}</span>
                                {s?.userKey ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400">Your key</span>
                                ) : s?.envKey ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-foreground-muted">Server default</span>
                                ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/10 text-foreground-subtle">Not set</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {s?.userKey && !isEditing && (
                                    <button onClick={() => removeKey(provider)} disabled={busy}
                                        className="p-1 text-foreground-subtle hover:text-red-400 disabled:opacity-50" title="Remove your key">
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                                {!isEditing ? (
                                    <button onClick={() => { setEditing(provider); setInputValue(''); setError(null); }}
                                        className="px-2 py-1 text-xs text-foreground-muted hover:text-foreground">
                                        {s?.userKey ? 'Change' : 'Add key'}
                                    </button>
                                ) : (
                                    <button onClick={() => { setEditing(null); setInputValue(''); }}
                                        className="px-2 py-1 text-xs text-foreground-subtle hover:text-foreground">Cancel</button>
                                )}
                            </div>
                        </div>
                        {isEditing && (
                            <div className="mt-2 flex gap-2">
                                <input type="password" value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    placeholder={`Paste your ${info.label} API key…`}
                                    className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:border-accent-primary font-mono placeholder:font-sans placeholder:text-foreground-subtle"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter' && inputValue.trim().length >= 8) saveKey(provider); }} />
                                <button onClick={() => saveKey(provider)} disabled={busy || inputValue.trim().length < 8}
                                    className="px-3 py-1.5 text-sm font-medium bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Save
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

interface BrandVoiceSettingsProps {
    settings: GlobalPromptSettings;
    onChange: (updates: Partial<GlobalPromptSettings>) => void;
}

const CHAR_LIMITS = {
    copywriterPersona: 800,
    brandKnowledge: 2000,
};

// ─── BrandVoiceSettings ──────────────────────────────────────────

export function BrandVoiceSettings({ settings, onChange }: BrandVoiceSettingsProps) {
    const activeProvider = settings.aiProvider || 'google';
    const activeModel = settings.aiModel || 'gemini-2.5-flash';

    // Filter models to only show for the active provider
    const availableModels = AVAILABLE_AI_MODELS.filter(m => m.provider === activeProvider);

    const handleSetActiveProvider = (provider: AIProvider) => {
        const defaultModel = AVAILABLE_AI_MODELS.find(m => m.provider === provider)?.id;
        onChange({
            aiProvider: provider,
            aiModel: defaultModel,
        });
    };

    const handleKillListAdd = (value: string) => {
        if (value.trim() && !settings.killList.includes(value.trim())) {
            onChange({ killList: [...settings.killList, value.trim()] });
        }
    };

    const handleKillListRemove = (value: string) => {
        onChange({ killList: settings.killList.filter(item => item !== value) });
    };

    return (
        <div className="space-y-8">
            {/* ─── AI Engine Section ─────────────────────────── */}
            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-foreground">AI Engine</h3>
                </div>
                <p className="text-sm text-foreground-muted">
                    Choose the provider and model that power your copy generation. Add your own
                    API keys below, or rely on the server defaults.
                </p>

                {/* Provider selection — keys live in server env vars, not here */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Provider</label>
                    <div className="flex flex-wrap gap-2">
                        {(['google', 'anthropic', 'openai'] as AIProvider[]).map(provider => {
                            const info = AI_PROVIDER_INFO[provider];
                            const isActive = activeProvider === provider;
                            return (
                                <button
                                    key={provider}
                                    onClick={() => handleSetActiveProvider(provider)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
                                        isActive
                                            ? 'bg-accent-primary/10 border-accent-primary text-foreground'
                                            : 'bg-background-tertiary border-border text-foreground-muted hover:text-foreground'
                                    }`}
                                >
                                    <span>{info.emoji}</span>
                                    {info.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Your API Keys — secure per-user, via /api/ai/keys */}
                <ProviderKeyManager />

                {/* Model Selector — filtered to active provider */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                        Model
                    </label>
                    <select
                        value={activeModel}
                        onChange={(e) => onChange({ aiModel: e.target.value })}
                        className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent-primary"
                    >
                        {availableModels.map(model => (
                            <option key={model.id} value={model.id}>
                                {model.displayName} — {model.description}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-foreground-subtle">
                        Model selection applies to all future generations across the team.
                    </p>
                </div>
            </div>

            {/* ─── Divider ────────────────────────────────────── */}
            <div className="border-t border-border" />

            {/* ─── Brand Voice Section ────────────────────────── */}
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Brand Voice</h3>
                <p className="text-sm text-foreground-muted">
                    Define your brand&apos;s AI writing style and constraints
                </p>
            </div>

            {/* Copywriter Persona */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                        Copywriter Persona
                    </label>
                    <span className={`text-xs ${settings.copywriterPersona.length > CHAR_LIMITS.copywriterPersona
                            ? 'text-accent-error'
                            : 'text-foreground-muted'
                        }`}>
                        {settings.copywriterPersona.length} / {CHAR_LIMITS.copywriterPersona}
                    </span>
                </div>
                <textarea
                    value={settings.copywriterPersona}
                    onChange={(e) => onChange({ copywriterPersona: e.target.value })}
                    placeholder="Define the AI's writing persona (e.g., 'You are a direct-response copywriter who writes punchy, benefit-focused Meta ads...')"
                    className="w-full h-32 px-4 py-3 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary resize-none"
                />
                <p className="text-xs text-foreground-subtle">
                    This is the system prompt that defines how the AI writes. Be specific about tone, style, and approach.
                </p>
            </div>

            {/* Brand Knowledge */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                        Brand Knowledge
                    </label>
                    <span className={`text-xs ${settings.brandKnowledge.length > CHAR_LIMITS.brandKnowledge
                            ? 'text-accent-error'
                            : 'text-foreground-muted'
                        }`}>
                        {settings.brandKnowledge.length} / {CHAR_LIMITS.brandKnowledge}
                    </span>
                </div>
                <textarea
                    value={settings.brandKnowledge}
                    onChange={(e) => onChange({ brandKnowledge: e.target.value })}
                    placeholder="Key brand facts, positioning, values, and context that should inform all copy..."
                    className="w-full h-48 px-4 py-3 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary resize-none"
                />
                <p className="text-xs text-foreground-subtle">
                    Include brand story, unique value props, target market context, and any facts the AI should know.
                </p>
            </div>

            {/* Emoji Density */}
            <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                    Emoji Density
                </label>
                <div className="flex gap-3">
                    {(['none', 'sparse', 'liberal'] as const).map(density => (
                        <button
                            key={density}
                            onClick={() => onChange({ emojiDensity: density })}
                            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${settings.emojiDensity === density
                                    ? 'bg-accent-primary text-white'
                                    : 'bg-background-tertiary text-foreground-muted hover:text-foreground hover:bg-background-secondary border border-border'
                                }`}
                        >
                            {density === 'none' && '🚫 None'}
                            {density === 'sparse' && '✨ Sparse'}
                            {density === 'liberal' && '🎉 Liberal'}
                        </button>
                    ))}
                </div>
                <p className="text-xs text-foreground-subtle">
                    Controls how frequently emojis appear in generated copy.
                </p>
            </div>

            {/* Kill List */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">
                        Kill List
                    </label>
                    <span className="text-xs text-foreground-muted">
                        {settings.killList.length} / 50 items
                    </span>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Add word or phrase to avoid..."
                        className="flex-1 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleKillListAdd((e.target as HTMLInputElement).value);
                                (e.target as HTMLInputElement).value = '';
                            }
                        }}
                        disabled={settings.killList.length >= 50}
                    />
                    <button
                        onClick={(e) => {
                            const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                            handleKillListAdd(input.value);
                            input.value = '';
                        }}
                        disabled={settings.killList.length >= 50}
                        className="px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Add
                    </button>
                </div>
                {settings.killList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {settings.killList.map(item => (
                            <span
                                key={item}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent-error/10 text-accent-error rounded-full text-xs"
                            >
                                {item}
                                <button
                                    onClick={() => handleKillListRemove(item)}
                                    className="hover:bg-accent-error/20 rounded-full p-0.5 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <p className="text-xs text-foreground-subtle">
                    Words and phrases the AI should never use. Press Enter to add.
                </p>
            </div>
        </div>
    );
}
