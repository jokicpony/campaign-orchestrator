'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Brain as BrainIcon, AlertCircle } from 'lucide-react';
import { BrainConfig, CopyItem, GeneratedItem, GenerationSession, GlobalPromptSettings, CampaignBrief } from '@/types';
import { generateCopy, generateIteration, generateRemix, generateCustomIteration, isApiKeyConfigured } from '@/lib/ai';
import { BrainControls } from './BrainControls';
import { ReviewList } from './ReviewList';
import { PromptConsole } from './PromptConsole';

// Undo stack entry type
interface UndoEntry {
    action: 'accept' | 'reject';
    item: GeneratedItem;
    copyItemId?: string; // Track the CopyItem ID created on accept (needed to remove from palette)
}

interface BrainProps {
    config: BrainConfig;
    onConfigChange: (updates: Partial<BrainConfig>) => void;
    onAddToActive: (itemOrItems: CopyItem | CopyItem[]) => void;
    onRemoveFromActive: (id: string) => void;
    globalSettings: GlobalPromptSettings;
    campaignBrief: CampaignBrief;
}

export function Brain({ config, onConfigChange, onAddToActive, onRemoveFromActive, globalSettings }: BrainProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [pendingItems, setPendingItems] = useState<GeneratedItem[]>([]);
    const [sessions, setSessions] = useState<GenerationSession[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [streamingText, setStreamingText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [lastPrompts, setLastPrompts] = useState<{ system: string; user: string; timestamp: Date; provider?: string; model?: string } | null>(null);
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

    const apiKeyConfigured = isApiKeyConfigured(globalSettings);

    // Handle generation
    const handleGenerate = useCallback(async (type: 'headline' | 'primary_text' | 'both', count: number) => {
        if (!apiKeyConfigured) {
            setError('No AI provider configured. Add an API key in Settings → Brand Voice.');
            return;
        }

        setError(null);
        setIsGenerating(true);
        setStreamingText('');

        try {
            // Get previous generations for variety
            const previousTexts = sessions
                .flatMap(s => s.items)
                .map(i => i.text)
                .slice(-10);

            // Find selected product for USP injection
            const selectedProduct = config.selectedProductId
                ? globalSettings.products.find(p => p.id === config.selectedProductId)
                : undefined;

            // Find selected persona for audience targeting
            const selectedPersona = config.selectedPersonaId
                ? globalSettings.customerPersonas.find(p => p.id === config.selectedPersonaId)
                : undefined;

            const result = await generateCopy({
                config,
                type,
                count,
                globalSettings,
                product: selectedProduct,
                persona: selectedPersona,
                previousGenerations: previousTexts,
            }, (chunk) => {
                setStreamingText(prev => prev + chunk);
            });

            // Add to pending items
            setPendingItems(prev => [...prev, ...result.items]);

            // Capture prompts for the Prompt Console
            if (result.prompts) {
                setLastPrompts({ ...result.prompts, provider: globalSettings?.aiProvider || 'google', model: globalSettings?.aiModel || 'gemini-2.5-flash' });
            }

            // Save session
            const session: GenerationSession = {
                id: `session-${Date.now()}`,
                context: config.context,
                temperature: config.temperature,
                modifiers: config.activeModifiers,
                items: result.items,
                createdAt: new Date(),
            };
            setSessions(prev => [...prev, session]);
        } catch (err) {
            console.error('Generation failed:', err);
            setError(err instanceof Error ? err.message : 'Generation failed. Please try again.');
        } finally {
            setIsGenerating(false);
            setStreamingText('');
        }
    }, [apiKeyConfigured, config, sessions, globalSettings]);

    // Accept an item (move to Active Palette)
    const handleAccept = useCallback((itemId: string) => {
        const item = pendingItems.find(i => i.id === itemId);
        if (item) {
            // Convert to CopyItem and add to active
            const copyItemId = `copy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const copyItem: CopyItem = {
                id: copyItemId,
                text: item.text,
                type: item.type,
                source: 'ai_generated',
                createdAt: new Date(),
            };
            onAddToActive(copyItem);

            // Push to undo stack (cap at 20)
            setUndoStack(prev => [...prev.slice(-19), { action: 'accept', item, copyItemId }]);

            // Mark as accepted in pending
            setPendingItems(prev => prev.filter(i => i.id !== itemId));

            // Update session item status
            setSessions(prev => prev.map(s => ({
                ...s,
                items: s.items.map(i => i.id === itemId ? { ...i, status: 'accepted' as const } : i),
            })));
        }
    }, [pendingItems, onAddToActive]);

    // Accept multiple items at once (batch — avoids stale closure issues)
    const handleAcceptMultiple = useCallback((itemIds: string[]) => {
        const items = itemIds.map(id => pendingItems.find(i => i.id === id)).filter(Boolean) as GeneratedItem[];
        if (items.length === 0) return;

        // Convert all to CopyItems in one batch
        const copyItems: CopyItem[] = items.map(item => ({
            id: `copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text: item.text,
            type: item.type,
            source: 'ai_generated' as const,
            createdAt: new Date(),
        }));

        // Single call to add all items at once
        onAddToActive(copyItems);

        // Push all to undo stack
        const undoEntries: UndoEntry[] = items.map((item, idx) => ({
            action: 'accept' as const,
            item,
            copyItemId: copyItems[idx].id,
        }));
        setUndoStack(prev => [...prev.slice(-(20 - undoEntries.length)), ...undoEntries]);

        // Remove from pending
        const idSet = new Set(itemIds);
        setPendingItems(prev => prev.filter(i => !idSet.has(i.id)));

        // Update session statuses
        setSessions(prev => prev.map(s => ({
            ...s,
            items: s.items.map(i => idSet.has(i.id) ? { ...i, status: 'accepted' as const } : i),
        })));
    }, [pendingItems, onAddToActive]);

    // Reject an item
    const handleReject = useCallback((itemId: string) => {
        const item = pendingItems.find(i => i.id === itemId);
        if (item) {
            // Push to undo stack (cap at 20)
            setUndoStack(prev => [...prev.slice(-19), { action: 'reject', item }]);
        }

        setPendingItems(prev => prev.filter(i => i.id !== itemId));

        // Update session item status
        setSessions(prev => prev.map(s => ({
            ...s,
            items: s.items.map(i => i.id === itemId ? { ...i, status: 'rejected' as const } : i),
        })));
    }, [pendingItems]);

    // Reject multiple items at once (batch — avoids stale closure issues)
    const handleRejectMultiple = useCallback((itemIds: string[]) => {
        const items = itemIds.map(id => pendingItems.find(i => i.id === id)).filter(Boolean) as GeneratedItem[];
        if (items.length === 0) return;

        // Push all to undo stack
        const undoEntries: UndoEntry[] = items.map(item => ({
            action: 'reject' as const,
            item,
        }));
        setUndoStack(prev => [...prev.slice(-(20 - undoEntries.length)), ...undoEntries]);

        // Remove from pending in one pass
        const idSet = new Set(itemIds);
        setPendingItems(prev => prev.filter(i => !idSet.has(i.id)));

        // Update session statuses
        setSessions(prev => prev.map(s => ({
            ...s,
            items: s.items.map(i => idSet.has(i.id) ? { ...i, status: 'rejected' as const } : i),
        })));
    }, [pendingItems]);

    // Undo last accept/reject
    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;

        const lastEntry = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));

        // Restore item to pending list
        setPendingItems(prev => [lastEntry.item, ...prev]);

        // Revert session item status back to pending
        setSessions(prev => prev.map(s => ({
            ...s,
            items: s.items.map(i => i.id === lastEntry.item.id ? { ...i, status: 'pending' as const } : i),
        })));

        // If it was an accept, also remove from Active Palette
        if (lastEntry.action === 'accept' && lastEntry.copyItemId) {
            onRemoveFromActive(lastEntry.copyItemId);
        }
    }, [undoStack, onRemoveFromActive]);

    // Iterate on a history item (starts the refine flow)
    const handleIterateFromHistory = useCallback((item: GeneratedItem) => {
        // Add the item to pending so it appears in the review list for selection
        const restoredItem: GeneratedItem = {
            ...item,
            id: `history-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            status: 'pending',
        };
        setPendingItems(prev => [restoredItem, ...prev]);

        // Remove from session history to prevent infinite undo loops
        setSessions(prev => prev.map(session => ({
            ...session,
            items: session.items.filter(i => i.id !== item.id),
        })).filter(session => session.items.length > 0));
    }, []);

    // Clear all pending
    const handleClearPending = useCallback(() => {
        setPendingItems([]);
    }, []);

    // Add item from history
    const handleAddFromHistory = useCallback((item: GeneratedItem) => {
        const copyItem: CopyItem = {
            id: `copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text: item.text,
            type: item.type,
            source: 'ai_generated',
            createdAt: new Date(),
        };
        onAddToActive(copyItem);
    }, [onAddToActive]);

    // Iterate with a modifier (either globally or on a specific item, or with custom direction)
    const handleIterate = useCallback(async (
        modifierId: string,
        baseCopy?: { text: string; type: 'headline' | 'primary_text' },
        customDirection?: string
    ) => {
        if (!apiKeyConfigured) {
            setError('No AI provider configured. Add an API key in Settings → Brand Voice.');
            return;
        }

        setError(null);
        setIsGenerating(true);
        setStreamingText('');

        try {
            if (baseCopy) {
                // Item-specific iteration
                if (modifierId === 'custom' && customDirection) {
                    // Custom freeform direction
                    const result = await generateCustomIteration(
                        baseCopy,
                        customDirection,
                        globalSettings,
                        (chunk) => setStreamingText(prev => prev + chunk),
                        config.temperature
                    );

                    setPendingItems(prev => [...prev, ...result.items]);

                    // Capture prompts for the Prompt Console
                    if (result.prompts) {
                        setLastPrompts({ ...result.prompts, provider: globalSettings?.aiProvider || 'google', model: globalSettings?.aiModel || 'gemini-2.5-flash' });
                    }

                    const session: GenerationSession = {
                        id: `session-${Date.now()}`,
                        context: `Custom: "${customDirection}" on "${baseCopy.text.slice(0, 30)}..."`,
                        temperature: config.temperature,
                        modifiers: ['custom'],
                        items: result.items,
                        createdAt: new Date(),
                    };
                    setSessions(prev => [...prev, session]);
                } else {
                    // Preset modifier iteration (use iterationActions from settings)
                    const action = globalSettings.iterationActions.find(a => a.id === modifierId);
                    if (!action) return;

                    const result = await generateIteration(
                        baseCopy,
                        { ...action, isBuiltIn: true },  // Convert to PromptModifier shape
                        globalSettings,
                        (chunk) => setStreamingText(prev => prev + chunk),
                        config.temperature
                    );

                    setPendingItems(prev => [...prev, ...result.items]);

                    // Capture prompts for the Prompt Console
                    if (result.prompts) {
                        setLastPrompts({ ...result.prompts, provider: globalSettings?.aiProvider || 'google', model: globalSettings?.aiModel || 'gemini-2.5-flash' });
                    }

                    const session: GenerationSession = {
                        id: `session-${Date.now()}`,
                        context: `Iteration of: "${baseCopy.text.slice(0, 50)}..."`,
                        temperature: config.temperature,
                        modifiers: [modifierId],
                        items: result.items,
                        createdAt: new Date(),
                    };
                    setSessions(prev => [...prev, session]);
                }
            }
        } catch (err) {
            console.error('Iteration failed:', err);
            setError(err instanceof Error ? err.message : 'Iteration failed. Please try again.');
        } finally {
            setIsGenerating(false);
            setStreamingText('');
        }
        // Must include config + globalSettings: iteration reads config.temperature,
        // the provider/model, brand voice, and iterationActions. Omitting them
        // froze this callback at mount, so any mid-session Settings/slider change
        // was silently ignored on iterate.
    }, [apiKeyConfigured, config, globalSettings]);

    // Remix (selection-aware: riff on selected items, or full regenerate if none)
    const handleRemix = useCallback(async (selectedItems?: Array<{ text: string; type: 'headline' | 'primary_text' }>) => {
        if (!selectedItems || selectedItems.length === 0) {
            // No selection: full regeneration with same settings
            handleGenerate('both', 6);
            return;
        }

        // Grouped remix: all selected items as vibe-setters, 5 fresh variations
        setError(null);
        setIsGenerating(true);
        setStreamingText('');

        try {
            const result = await generateRemix(
                selectedItems,
                globalSettings,
                (chunk) => setStreamingText(prev => prev + chunk),
                5,
                config.temperature
            );

            setPendingItems(prev => [...prev, ...result.items]);

            if (result.prompts) {
                setLastPrompts({ ...result.prompts, provider: globalSettings?.aiProvider || 'google', model: globalSettings?.aiModel || 'gemini-2.5-flash' });
            }

            const session: GenerationSession = {
                id: `session-${Date.now()}`,
                context: `🔀 Remix inspired by ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''}`,
                temperature: Math.min(config.temperature + 0.1, 1.0),
                modifiers: ['remix'],
                items: result.items,
                createdAt: new Date(),
            };
            setSessions(prev => [...prev, session]);
        } catch (err) {
            console.error('Remix failed:', err);
            setError(err instanceof Error ? err.message : 'Remix failed. Please try again.');
        } finally {
            setIsGenerating(false);
            setStreamingText('');
        }
    }, [handleGenerate, globalSettings, config]);

    // Clear history
    const handleClearHistory = useCallback(() => {
        setSessions([]);
        setShowHistory(false);
    }, []);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[var(--bg-secondary)]">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-purple-500/30 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/15">
                        <BrainIcon className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="flex flex-col">
                        <h3 className="font-semibold text-[var(--text-primary)]">AI Co-Writer</h3>
                        <span className="text-[10px] text-[var(--text-muted)]">Generate headlines and primary text</span>
                    </div>
                    {pendingItems.length > 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500 text-white animate-pulse">
                            {pendingItems.length} pending
                        </span>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
                    {/* Left: Controls */}
                    <div className="overflow-auto pb-4">
                        {!apiKeyConfigured && (
                            <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-amber-400">
                                    No AI provider configured. Add an API key in Settings → Brand Voice to enable AI generation.
                                </p>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        <BrainControls
                            config={config}
                            onConfigChange={onConfigChange}
                            modifiers={globalSettings.modifiers}
                            products={globalSettings.products}
                            personas={globalSettings.customerPersonas}
                            onGenerate={handleGenerate}
                            isGenerating={isGenerating}
                            disabled={!apiKeyConfigured}
                        />

                        {/* Prompt Console */}
                        <PromptConsole prompts={lastPrompts} />

                        {/* Streaming preview */}
                        {isGenerating && streamingText && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-4 p-3 bg-[var(--bg-primary)] rounded-lg border border-purple-500/30"
                            >
                                <p className="text-xs text-purple-400 mb-1">Generating...</p>
                                <p className="text-sm text-[var(--text-muted)] font-mono whitespace-pre-wrap">
                                    {streamingText}
                                    <span className="animate-pulse">▊</span>
                                </p>
                            </motion.div>
                        )}
                    </div>

                    {/* Right: Review List */}
                    <div className="flex flex-col min-h-0 overflow-hidden">
                        <ReviewList
                            pendingItems={pendingItems}
                            sessions={sessions}
                            iterationActions={globalSettings.iterationActions}
                            onAccept={handleAccept}
                            onAcceptMultiple={handleAcceptMultiple}
                            onReject={handleReject}
                            onRejectMultiple={handleRejectMultiple}
                            onClearPending={handleClearPending}
                            onAddFromHistory={handleAddFromHistory}
                            onIterate={handleIterate}
                            onRemix={handleRemix}
                            onClearHistory={handleClearHistory}
                            showHistory={showHistory}
                            onToggleHistory={() => setShowHistory(!showHistory)}
                            canUndo={undoStack.length > 0}
                            onUndo={handleUndo}
                            onIterateFromHistory={handleIterateFromHistory}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

