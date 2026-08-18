'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tag, Copy, Check, ExternalLink, Clock } from 'lucide-react';
import { GlobalPromptSettings, NamingConventionTemplate, DEFAULT_AD_TYPES, mergeAdTypes } from '@/types';

interface AdNamerProps {
    globalSettings: GlobalPromptSettings;
}

interface CopiedName {
    id: string;
    name: string;
    copiedAt: Date;
}

function assembleAdName(
    angleName: string,
    adType: string,
    tokenValues: Record<string, string>,
    template: NamingConventionTemplate | undefined,
    adTypesConfig: typeof DEFAULT_AD_TYPES
): string {
    if (!template) return '';

    const parts = template.tokens.map(tok => {
        let val = '';
        if (tok.type === 'auto') {
            if (tok.autoSource === 'angleName') {
                val = angleName || '';
            } else if (tok.autoSource === 'adType') {
                const adTypeConfig = adTypesConfig.find(t => t.id === adType);
                val = adTypeConfig?.namingAlias || adType || '';
            }
        } else {
            val = tokenValues[tok.key] || '';
        }
        return val.replace(/\s+/g, '-');
    }).filter(Boolean);

    return parts.length > 0 ? parts.join(template.separator) : '';
}

export function AdNamer({ globalSettings }: AdNamerProps) {
    const templates = globalSettings.namingTemplates || [];
    const adTypesConfig = mergeAdTypes(globalSettings.adTypes);
    const defaultTemplateId = globalSettings.defaultNamingTemplateId || templates[0]?.id || '';

    // Single namer state
    const [templateId, setTemplateId] = useState(defaultTemplateId);
    const [angleName, setAngleName] = useState('');
    const [adType, setAdType] = useState('');
    const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
    const [justCopied, setJustCopied] = useState(false);

    // Copy history (session-only)
    const [history, setHistory] = useState<CopiedName[]>([]);
    const [recopiedId, setRecopiedId] = useState<string | null>(null);

    const activeTemplate = templates.find(t => t.id === templateId) || templates[0];

    const generatedName = useMemo(
        () => assembleAdName(angleName, adType, tokenValues, activeTemplate, adTypesConfig),
        [angleName, adType, tokenValues, activeTemplate, adTypesConfig]
    );

    const handleCopy = async () => {
        if (!generatedName) return;
        await navigator.clipboard.writeText(generatedName);
        setJustCopied(true);
        setTimeout(() => setJustCopied(false), 2000);

        // Add to history (avoid consecutive duplicates)
        if (history.length === 0 || history[0].name !== generatedName) {
            setHistory(prev => [{
                id: `h-${Date.now()}`,
                name: generatedName,
                copiedAt: new Date(),
            }, ...prev].slice(0, 50)); // Keep last 50
        }
    };

    const handleRecopy = async (entry: CopiedName) => {
        await navigator.clipboard.writeText(entry.name);
        setRecopiedId(entry.id);
        setTimeout(() => setRecopiedId(null), 2000);
    };

    const handleTemplateChange = (newId: string) => {
        setTemplateId(newId);
        setTokenValues({}); // Reset custom values on template switch
    };

    if (templates.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="p-4 rounded-2xl bg-amber-500/10 mb-4">
                    <Tag className="w-8 h-8 text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                    No Naming Templates
                </h3>
                <p className="text-sm text-[var(--text-muted)] max-w-sm">
                    Set up naming templates in <span className="text-[var(--accent-primary)] font-medium">Settings → Naming</span> to start generating ad names.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-[var(--border-primary)] px-5 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/15">
                            <Tag className="w-5 h-5 text-amber-400" />
                        </div>
                        <div className="flex flex-col">
                            <h3 className="font-semibold text-[var(--text-primary)]">Ad Namer</h3>
                            <span className="text-[10px] text-[var(--text-muted)]">
                                Quick name generator for ads produced outside of this tool. Uses standardized templates.
                            </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[9px] font-semibold uppercase tracking-wide">
                            Offline Tool
                        </span>
                    </div>
                    {/* Template selector in header if multiple */}
                    {templates.length > 1 && (
                        <select
                            value={templateId}
                            onChange={(e) => handleTemplateChange(e.target.value)}
                            className="px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-xs text-[var(--text-secondary)]
                                focus:outline-none focus:border-amber-500/50 transition-colors"
                        >
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Main content — vertical stack */}
            <div className="flex-1 overflow-auto px-5 py-4">
                {/* Token fields grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {activeTemplate?.tokens.map(token => {
                        if (token.type === 'auto' && token.autoSource === 'angleName') {
                            return (
                                <div key={token.id}>
                                    <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                                        {token.label}
                                    </label>
                                    <input
                                        type="text"
                                        value={angleName}
                                        onChange={(e) => setAngleName(e.target.value)}
                                        placeholder="e.g. Holiday-Sale"
                                        className="w-full px-2.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]
                                            placeholder:text-[var(--text-muted)]/50 focus:outline-none focus:border-amber-500/50 transition-colors"
                                    />
                                </div>
                            );
                        }

                        if (token.type === 'auto' && token.autoSource === 'adType') {
                            return (
                                <div key={token.id}>
                                    <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                                        {token.label}
                                    </label>
                                    <select
                                        value={adType}
                                        onChange={(e) => setAdType(e.target.value)}
                                        className="w-full px-2.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]
                                            focus:outline-none focus:border-amber-500/50 transition-colors"
                                    >
                                        <option value="">Select type...</option>
                                        {adTypesConfig.map(t => (
                                            <option key={t.id} value={t.id}>{t.displayName}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        }

                        if (token.type === 'dropdown' && token.options && token.options.length > 0) {
                            return (
                                <div key={token.id}>
                                    <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                                        {token.label}
                                    </label>
                                    <select
                                        value={tokenValues[token.key] || ''}
                                        onChange={(e) => setTokenValues(prev => ({ ...prev, [token.key]: e.target.value }))}
                                        className="w-full px-2.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]
                                            focus:outline-none focus:border-amber-500/50 transition-colors"
                                    >
                                        <option value="">Select...</option>
                                        {token.options.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        }

                        return (
                            <div key={token.id}>
                                <label className="block text-[10px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                                    {token.label}
                                </label>
                                <input
                                    type="text"
                                    value={tokenValues[token.key] || ''}
                                    onChange={(e) => setTokenValues(prev => ({ ...prev, [token.key]: e.target.value }))}
                                    placeholder={`Enter ${token.label.toLowerCase()}...`}
                                    className="w-full px-2.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)]
                                        placeholder:text-[var(--text-muted)]/50 focus:outline-none focus:border-amber-500/50 transition-colors"
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Live preview + Copy */}
                <div className="mt-4 flex items-center gap-2">
                    <div className={`flex-1 px-3 py-2.5 rounded-lg font-mono text-sm border transition-colors ${generatedName
                        ? 'bg-amber-500/5 border-amber-500/20 text-[var(--text-primary)]'
                        : 'bg-[var(--bg-primary)] border-[var(--border-primary)] text-[var(--text-muted)]/50 italic'
                        }`}>
                        {generatedName || 'Fill in fields to preview name...'}
                    </div>
                    <motion.button
                        onClick={handleCopy}
                        disabled={!generatedName}
                        whileHover={{ scale: generatedName ? 1.05 : 1 }}
                        whileTap={{ scale: generatedName ? 0.95 : 1 }}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${justCopied
                            ? 'bg-green-500/20 text-green-400'
                            : generatedName
                                ? 'bg-amber-500 text-white hover:bg-amber-600 shadow-sm'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                            }`}
                    >
                        {justCopied ? (
                            <><Check className="w-3.5 h-3.5" /> Copied!</>
                        ) : (
                            <><Copy className="w-3.5 h-3.5" /> Copy</>
                        )}
                    </motion.button>
                </div>

                {/* Footer hint */}
                <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                    <ExternalLink className="w-3 h-3" />
                    <span>Generate names here, then paste into Meta Ads Manager</span>
                </div>

                {/* Copy History — below the namer */}
                <div className="mt-6 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                <span className="text-xs font-semibold text-[var(--text-primary)]">Copy History</span>
                            </div>
                            {history.length > 0 && (
                                <span className="text-[10px] text-[var(--text-muted)]">
                                    {history.length} name{history.length !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>

                    {history.length === 0 ? (
                        <div className="flex items-center justify-center py-6 text-center">
                            <div className="flex items-center gap-2">
                                <Copy className="w-4 h-4 text-[var(--text-muted)]/30" />
                                <p className="text-[11px] text-[var(--text-muted)]">
                                    Copied names appear here for quick reference
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--border-primary)]">
                            <AnimatePresence initial={false}>
                                {history.map((entry) => (
                                    <motion.div
                                        key={entry.id}
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-tertiary)] transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-mono text-[var(--text-secondary)] truncate" title={entry.name}>
                                                {entry.name}
                                            </p>
                                        </div>
                                        <span className="text-[9px] text-[var(--text-muted)] flex-shrink-0">
                                            {entry.copiedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <button
                                            onClick={() => handleRecopy(entry)}
                                            className={`flex-shrink-0 p-1.5 rounded-md transition-all ${recopiedId === entry.id
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'opacity-0 group-hover:opacity-100 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                                }`}
                                            title="Copy again"
                                        >
                                            {recopiedId === entry.id ? (
                                                <Check className="w-3 h-3" />
                                            ) : (
                                                <Copy className="w-3 h-3" />
                                            )}
                                        </button>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
