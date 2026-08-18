'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Copy, Check, Terminal, Clock, Cpu } from 'lucide-react';
import { AVAILABLE_AI_MODELS, AI_PROVIDER_INFO, AIProvider } from '@/types';

interface PromptConsoleProps {
    prompts: {
        system: string;
        user: string;
        timestamp: Date;
        provider?: string;
        model?: string;
    } | null;
}

function PromptSection({ label, content, accent }: { label: string; content: string; accent: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: `${accent}30` }}>
            {/* Section header */}
            <div
                className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: `${accent}10` }}
            >
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                    {label}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-all hover:bg-white/5"
                    style={{ color: accent }}
                >
                    {copied ? (
                        <>
                            <Check className="w-3 h-3" />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy className="w-3 h-3" />
                            Copy
                        </>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="p-3 bg-black/40">
                <pre className="text-[11px] leading-relaxed text-gray-300 font-mono whitespace-pre-wrap break-words">
                    {content}
                </pre>
            </div>
        </div>
    );
}

export function PromptConsole({ prompts }: PromptConsoleProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!prompts) return null;

    const timeStr = prompts.timestamp.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    // Resolve provider & model display names
    const providerKey = (prompts.provider || 'google') as AIProvider;
    const providerInfo = AI_PROVIDER_INFO[providerKey];
    const modelOption = AVAILABLE_AI_MODELS.find(m => m.id === prompts.model);
    const modelDisplay = modelOption?.displayName || prompts.model || 'Unknown';

    return (
        <div className="mt-4 rounded-xl border border-purple-500/20 overflow-hidden bg-[var(--bg-primary)]">
            {/* Toggle Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-purple-500/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-purple-400">
                        Prompt Console
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-[9px] font-mono text-purple-300">
                        LAST RUN
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Provider + Model badge */}
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[var(--text-muted)]">
                        <Cpu className="w-3 h-3" />
                        <span>{providerInfo?.emoji}</span>
                        <span className="font-medium text-[var(--text-secondary)]">{modelDisplay}</span>
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                        <Clock className="w-3 h-3" />
                        {timeStr}
                    </span>
                    <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronDown className="w-4 h-4 text-purple-400" />
                    </motion.div>
                </div>
            </button>

            {/* Expandable Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-purple-500/10">
                            {/* Model metadata banner */}
                            <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Provider</span>
                                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                                        {providerInfo?.emoji} {providerInfo?.label || providerKey}
                                    </span>
                                </div>
                                <div className="w-px h-3 bg-white/10" />
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">Model</span>
                                    <span className="text-xs font-mono text-[var(--text-secondary)]">
                                        {prompts.model || 'gemini-2.5-flash'}
                                    </span>
                                </div>
                            </div>

                            <PromptSection
                                label="System Prompt"
                                content={prompts.system}
                                accent="#a78bfa"
                            />
                            <PromptSection
                                label="User Prompt"
                                content={prompts.user}
                                accent="#60a5fa"
                            />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
