'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Sparkles, X } from 'lucide-react';
import { GlobalPromptSettings } from '@/types';
import { getCopywriterStatus, type CopywriterStatus } from '@/lib/ai/copywriter';

interface BrandVoiceSettingsProps {
    settings: GlobalPromptSettings;
    onChange: (updates: Partial<GlobalPromptSettings>) => void;
}

const LIMITS = { brandVoice: 6000, targetPersonas: 6000, killList: 50 };

// Shows which Gemini model the copywriter uses and whether the team key can
// reach it. The key itself lives only in the server env (GEMINI_API_KEY).
function ModelStatus() {
    const [status, setStatus] = useState<CopywriterStatus | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        getCopywriterStatus().then(setStatus).catch(() => setFailed(true));
    }, []);

    let tone: 'ok' | 'warn' = 'ok';
    let message = 'Checking the Gemini key…';
    if (failed) {
        tone = 'warn';
        message = 'Could not check the copywriter. Try again after reloading.';
    } else if (status && !status.configured) {
        tone = 'warn';
        message = 'GEMINI_API_KEY is not set on the server, so the copywriter is off.';
    } else if (status?.keyError) {
        tone = 'warn';
        message = `The Gemini key was rejected (${status.keyError}).`;
    } else if (status?.modelAvailable === false) {
        tone = 'warn';
        message = `${status.model} isn't available to this key, so the copywriter uses ${status.fallback}. Set GEMINI_MODEL to one of: ${status.proModels?.join(', ') || 'a current model'}.`;
    } else if (status) {
        message = `Writing with ${status.model}.`;
    }

    return (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${tone === 'ok'
            ? 'border-border bg-background-tertiary text-foreground-muted'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
            {tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-400" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{message}</span>
        </div>
    );
}

export function BrandVoiceSettings({ settings, onChange }: BrandVoiceSettingsProps) {
    const [killInput, setKillInput] = useState('');

    const addKillWord = () => {
        const word = killInput.trim();
        setKillInput('');
        if (!word || settings.killList.length >= LIMITS.killList) return;
        if (settings.killList.some(w => w.toLowerCase() === word.toLowerCase())) return;
        onChange({ killList: [...settings.killList, word] });
    };

    const field = (key: 'brandVoice' | 'targetPersonas', label: string, help: string, placeholder: string) => (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label htmlFor={key} className="text-sm font-medium text-foreground">{label}</label>
                <span className={`text-xs ${settings[key].length > LIMITS[key] ? 'text-accent-error' : 'text-foreground-muted'}`}>
                    {settings[key].length} / {LIMITS[key]}
                </span>
            </div>
            <textarea
                id={key}
                value={settings[key]}
                onChange={(e) => onChange({ [key]: e.target.value.slice(0, LIMITS[key]) })}
                placeholder={placeholder}
                className="w-full h-44 px-4 py-3 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary resize-y"
            />
            <p className="text-xs text-foreground-subtle">{help}</p>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" /> Copywriter
                </h3>
                <p className="text-sm text-foreground-muted">
                    Applies to every campaign. Product facts come from each campaign&apos;s Context.
                </p>
            </div>

            <ModelStatus />

            {field('brandVoice', 'Brand voice',
                'How the brand sounds: tone, house rules, words to use or avoid. Describe the brand, not the AI.',
                'Dry, confident, a little funny. Short sentences. At most one emoji. We say "pack", never "bag"…')}

            {field('targetPersonas', 'Target personas',
                'Who you sell to. A short paragraph each.',
                'Weekend adventurers: 28–45, camp and hike, buy gear that lasts…')}

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label htmlFor="kill-list" className="text-sm font-medium text-foreground">Kill list</label>
                    <span className="text-xs text-foreground-muted">{settings.killList.length} / {LIMITS.killList}</span>
                </div>
                <div className="flex gap-2">
                    <input
                        id="kill-list"
                        type="text"
                        value={killInput}
                        onChange={(e) => setKillInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addKillWord(); }}
                        placeholder="Add a word or phrase to ban…"
                        disabled={settings.killList.length >= LIMITS.killList}
                        className="flex-1 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-accent-primary"
                    />
                    <button
                        onClick={addKillWord}
                        disabled={!killInput.trim() || settings.killList.length >= LIMITS.killList}
                        className="px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Add
                    </button>
                </div>
                {settings.killList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {settings.killList.map(item => (
                            <span key={item} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent-error/10 text-accent-error rounded-full text-xs">
                                {item}
                                <button
                                    onClick={() => onChange({ killList: settings.killList.filter(w => w !== item) })}
                                    className="hover:bg-accent-error/20 rounded-full p-0.5 transition-colors"
                                    aria-label={`Remove ${item}`}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <p className="text-xs text-foreground-subtle">
                    Results containing these words are dropped.
                </p>
            </div>
        </div>
    );
}
