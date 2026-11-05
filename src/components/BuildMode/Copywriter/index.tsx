'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, Code2, Loader2, Send, Square, Wand2, X } from 'lucide-react';
import type { AdRow, CampaignBrief, CopyItem, GlobalPromptSettings } from '@/types';
import type { CopyContextPage, CopyTurn, CopyWinner } from '@/types/copywriter';
import { Draggable } from '@/lib/dnd';
import { fetchContextPages, writeCopy, type CopyUsage } from '@/lib/ai/copywriter';
import { buildMessages, buildSystemPrompt, COPY_FOLLOW_UPS, countPhrase, fillCounts, fillInstruction, FILL_ANGLES, KILL_LIST_MAX, longFormInstruction, KILL_TERM_MAX, MAX_TURNS, SETTINGS_TEXT_MAX } from '@/lib/ai/prompts';
import { normalizePageUrl, rowContextFor, rowLabel } from '@/lib/ai/rowContext';
import { UseButton, UseNote, useUseNote, type CopyTarget, type UseCopyResult } from '../CopyTarget';
import { notesFor, upsertPages } from '../CampaignContext';
import { COPY_TYPE } from '@/components/copyType';

interface CopywriterPanelProps {
    rows: AdRow[];
    targetRowId: string | null;
    brief: CampaignBrief;
    /** Functional update so async page reads never overwrite newer edits. */
    onBriefChange: (update: (brief: CampaignBrief) => CampaignBrief) => void;
    globalSettings: GlobalPromptSettings;
    /** The selected ad (picked at the top of the Palette): Use adds a result to it. */
    target: CopyTarget;
    /** Open the campaign's Context (links and notes), which lives on the Assembly Line. */
    onOpenContext: () => void;
    /** The Palette's Top Performers, best first: shared context for every row. */
    topCopy: CopyWinner[];
    /** Whether the Palette is open on this tab (it stays mounted so the conversation survives). */
    visible: boolean;
    /** Fill this ad: put up to `counts` of the results in the row's empty slots, in order. */
    onFill?: (rowId: string, items: CopyItem[], counts: { headlines: number; primaryTexts: number }) => UseCopyResult;
}

export interface CopywriterHandle {
    /** A row's sparkle button: focus the box. */
    open: () => void;
    /** "Riff on this" from a Palette card: write variations of it for the target row. */
    riff: (item: CopyItem) => void;
}

export function riffInstruction(item: Pick<CopyItem, 'text' | 'type'>): string {
    const kind = item.type === 'headline' ? 'headline' : 'primary text';
    return `Write fresh variations of this ${kind}: "${item.text}". Keep what makes it work; change the hook and the wording.`;
}

type ResultItem = CopyItem;

interface Entry {
    id: string;
    rowId: string;
    rowLabel: string;
    instruction: string;
    status: 'reading' | 'writing' | 'done' | 'error';
    raw: string;
    items: ResultItem[];
    error?: string;
    /** Fill this ad: how many of each it asked for, then what landed in the row. */
    fill?: { headlines: number; primaryTexts: number };
    filled?: UseCopyResult;
    usage?: CopyUsage;
    prompt?: { system: string; messages: { role: string; content: string }[] };
    used?: UsedContext;
}

/** What actually went into a write, shown on its result so nobody has to dig in the prompt. */
interface UsedContext {
    brand: boolean;           // brand voice or target personas set in Settings
    notes: boolean;
    links: number;            // Context links whose page text was sent
    linksNotRead: number;     // Context links with no text (failed or still reading)
    landing: 'read' | 'failed' | 'none';
    landingError?: string;
    topCopy: number;
}

// A landing page that failed to read is retried after this long, not on every write.
const RETRY_FAILED_PAGE_MS = 10 * 60 * 1000;

export const CopywriterPanel = forwardRef<CopywriterHandle, CopywriterPanelProps>(function CopywriterPanel({
    rows,
    targetRowId,
    brief,
    onBriefChange,
    globalSettings,
    target,
    onOpenContext,
    topCopy,
    visible,
    onFill,
}, ref) {
    const [instruction, setInstruction] = useState('');
    /** Long-form story: the box asks what the story is, and Write sends it as one long read. */
    const [storyMode, setStoryMode] = useState(false);
    const [entries, setEntries] = useState<Entry[]>([]);
    const [turns, setTurns] = useState<CopyTurn[]>([]);
    const [showPromptFor, setShowPromptFor] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const busyRef = useRef(false); // guards double clicks before the next render
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const entryCountRef = useRef(0);

    const targetIndex = rows.findIndex(r => r.id === targetRowId);
    const targetRow = targetIndex >= 0 ? rows[targetIndex] : null;
    const links = useMemo(() => brief.contextLinks ?? [], [brief.contextLinks]);
    const pages = useMemo(() => brief.contextPages ?? [], [brief.contextPages]);
    const busy = entries.some(e => e.status === 'reading' || e.status === 'writing');
    const notes = notesFor(brief);
    const toFill = targetRow ? fillCounts(targetRow) : { headlines: 0, primaryTexts: 0 };
    // The type decides how many slots publish (a carousel: one headline per card), so it comes first.
    const needsType = !!targetRow && !targetRow.adType;
    const canFill = !needsType && toFill.headlines + toFill.primaryTexts > 0;
    // Some angles need something to work from: imported top performers, or copy already in the ad
    const adSlots = targetRow ? [...targetRow.slots.headlines, ...targetRow.slots.primaryTexts] : [];
    const hasTopCopy = topCopy.length > 0 || adSlots.some(s => s?.masterItem.source === 'historical');
    const hasAdCopy = adSlots.some(Boolean);
    const followUps = COPY_FOLLOW_UPS.filter(s => hasTopCopy || !s.needsTopCopy);
    const typed = instruction.trim();
    // Fill's menu: no angle, then the angles that fit this ad. Anything typed in the box rides along.
    const fillOptions: FillOption[] = [
        { label: 'Any angle', hint: typed ? `Mixed, plus what you typed: “${typed}”` : 'Mixed angles, formats and lengths', text: '' },
        ...FILL_ANGLES.filter(a => (hasTopCopy || !a.needsTopCopy) && (hasAdCopy || !a.needsAdCopy)),
    ];
    const fillWith = (angle: string) => { setStoryMode(false); write([angle, typed].filter(Boolean).join(' '), 'fill'); };
    // Long-form story: with the story already typed it writes; otherwise the box asks for it.
    const startStory = () => {
        if (typed) { setStoryMode(false); write(typed, 'story'); return; }
        setStoryMode(true);
        inputRef.current?.focus();
    };
    const send = () => {
        if (!storyMode) { write(instruction); return; }
        if (!typed) { inputRef.current?.focus(); return; }
        setStoryMode(false);
        write(typed, 'story');
    };
    const fillBlocked = !targetRow ? 'Add an ad first'
        : needsType ? 'Pick an ad type for this ad first'
            : 'This ad\'s copy slots are full';

    // Follow new results: jump to a new entry, and keep up with streaming text
    // unless the reader has scrolled up to look at something.
    useEffect(() => {
        const el = bodyRef.current;
        // Nothing to follow yet: keep the intro and its Context link in view.
        if (!el || !visible || entries.length === 0) return;
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        if (nearBottom || entries.length !== entryCountRef.current) el.scrollTop = el.scrollHeight;
        entryCountRef.current = entries.length;
    }, [entries, visible]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const pageFor = useCallback(
        (url: string) => pages.find(p => normalizePageUrl(p.url) === normalizePageUrl(url)),
        [pages],
    );

    const patchEntry = useCallback((id: string, patch: Partial<Entry>) => {
        setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
    }, []);

    // ─── Writing ────────────────────────────────────────────────

    const write = useCallback(async (text: string, mode?: 'fill' | 'story') => {
        if (!targetRow || busyRef.current) return;
        const fill = mode === 'fill' ? fillCounts(targetRow) : undefined;
        if (fill && fill.headlines + fill.primaryTexts === 0) return;
        busyRef.current = true;
        // Created up front so Stop also works while the landing page is read.
        const controller = new AbortController();
        abortRef.current = controller;
        const ask = fill ? fillInstruction(fill, text)
            : mode === 'story' ? longFormInstruction(text)
                : text.trim() || 'Write strong options for this ad.';
        const entryId = `w-${Date.now()}`;
        const label = rowLabel(targetRow, targetIndex);
        setEntries(prev => [...prev, { id: entryId, rowId: targetRow.id, rowLabel: label, instruction: ask, status: 'writing', raw: '', items: [], fill }]);
        setInstruction('');

        // Read the row's destination page once per campaign; every row shares it.
        let knownPages = pages;
        const url = targetRow.slots.destinationUrl?.trim();
        const isLink = !!url && /^https?:\/\//i.test(url);
        const known = url ? pageFor(url) : undefined;
        const retry = !!known?.error && Date.now() - Date.parse(known.fetchedAt) > RETRY_FAILED_PAGE_MS;
        if (url && isLink && (!known || retry)) {
            patchEntry(entryId, { status: 'reading' });
            try {
                const fresh = await fetchContextPages([url]);
                knownPages = upsertPages(pages, fresh, links);
                onBriefChange(b => ({ ...b, contextPages: upsertPages(b.contextPages ?? [], fresh, b.contextLinks ?? []) }));
            } catch { /* write without it */ }
            if (controller.signal.aborted) {
                patchEntry(entryId, { status: 'error', error: 'Stopped.' });
                if (abortRef.current === controller) abortRef.current = null;
                busyRef.current = false;
                return;
            }
            patchEntry(entryId, { status: 'writing' });
        }

        const linkPages = links
            .map(l => knownPages.find(p => normalizePageUrl(p.url) === normalizePageUrl(l)))
            .filter((p): p is CopyContextPage => !!p && !!p.text);
        const row = rowContextFor(targetRow, targetIndex, knownPages);
        const landingPage = url ? knownPages.find(p => normalizePageUrl(p.url) === normalizePageUrl(url)) : undefined;
        const used: UsedContext = {
            brand: !!(globalSettings.brandVoice?.trim() || globalSettings.targetPersonas?.trim()),
            notes: !!notes.trim(),
            links: linkPages.length,
            linksNotRead: links.length - linkPages.length,
            landing: row.destinationPage ? 'read' : url ? 'failed' : 'none',
            landingError: row.destinationPage || !url ? undefined
                : !isLink ? 'the destination URL needs to start with https://'
                : landingPage?.error || 'it could not be read',
            topCopy: topCopy.length,
        };
        const input = {
            // Settings saved before Nov 2026 can be longer than the route accepts.
            brandVoice: (globalSettings.brandVoice ?? '').slice(0, SETTINGS_TEXT_MAX),
            targetPersonas: (globalSettings.targetPersonas ?? '').slice(0, SETTINGS_TEXT_MAX),
            killList: (globalSettings.killList ?? []).slice(0, KILL_LIST_MAX).map(w => w.slice(0, KILL_TERM_MAX)),
            campaign: { notes, pages: linkPages, topCopy },
            turns,
            row,
            instruction: ask,
            kind: fill ? 'fill' as const : mode === 'story' ? 'story' as const : 'write' as const,
        };
        const prompt = {
            system: buildSystemPrompt(input.brandVoice, input.targetPersonas, input.killList),
            messages: buildMessages(input.campaign, input.turns, input.row, input.instruction),
        };
        patchEntry(entryId, { prompt, used });

        try {
            const result = await writeCopy(input, raw => patchEntry(entryId, { raw }), controller.signal, mode === 'story' ? 'primary_text' : undefined);
            const now = Date.now();
            const items: ResultItem[] = result.items.map((item, i) => ({
                id: `ai-${now}-${i}`,
                text: item.text,
                type: item.type,
                source: 'ai_generated',
                createdAt: new Date(),
            }));
            // Fill this ad: the results go into the row's empty slots, in order, up to what was asked.
            const filled = fill && onFill && items.length > 0 ? onFill(targetRow.id, items, fill) : undefined;
            patchEntry(entryId, {
                status: 'done',
                items,
                filled,
                usage: result.usage,
                error: items.length === 0 ? 'Nothing usable came back. Try rephrasing.' : undefined,
            });
            // Compact history: the ask and the answer, not the page text again.
            setTurns(prev => [
                ...prev,
                { role: 'user' as const, content: `AD: ${label}\nINSTRUCTION: ${ask}` },
                { role: 'assistant' as const, content: result.raw },
            ].slice(-MAX_TURNS));
        } catch (err) {
            const aborted = controller.signal.aborted;
            patchEntry(entryId, { status: 'error', error: aborted ? 'Stopped.' : err instanceof Error ? err.message : 'The copywriter failed' });
        } finally {
            if (abortRef.current === controller) abortRef.current = null;
            busyRef.current = false;
        }
    }, [targetRow, targetIndex, pages, pageFor, links, notes, topCopy, turns, globalSettings, onBriefChange, patchEntry, onFill]);

    useImperativeHandle(ref, () => ({
        open: () => { requestAnimationFrame(() => inputRef.current?.focus()); },
        riff: (item: CopyItem) => { write(riffInstruction(item)); },
    }), [write]);

    const clearConversation = () => {
        abortRef.current?.abort();
        setEntries([]);
        setTurns([]);
        setStoryMode(false);
    };

    const lastDone = [...entries].reverse().find(e => e.status === 'done');
    const showFollowUps = !!lastDone && !busy;

    // ─── Render ─────────────────────────────────────────────────

    return (
        <div className="@container flex-1 min-h-0 flex flex-col">
            {/* The conversation (the selected ad is picked above, for the whole Palette) */}
            <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
                {entries.length === 0 ? (
                    <div className="space-y-3">
                        <p className="text-xs text-foreground-subtle leading-relaxed">
                            Writes <span className={COPY_TYPE.headline.text}>headlines</span> and <span className={COPY_TYPE.primary_text.text}>primary text</span> for the selected ad. Add product links in <button onClick={onOpenContext} className="text-purple-300 hover:underline">Campaign Context</button> for sharper copy.
                        </p>
                        <FillMenu
                            variant="card"
                            disabled={!canFill}
                            note={canFill ? `Writes ${countPhrase(toFill)} into its empty slots.` : `${fillBlocked}.`}
                            options={fillOptions}
                            onPick={fillWith}
                        />
                        <button
                            onClick={startStory}
                            disabled={!targetRow}
                            className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:border-purple-500/40 hover:bg-purple-500/5 disabled:opacity-40 transition-colors"
                        >
                            <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-purple-300" />
                            <span className="flex-1">
                                <span className="block text-xs font-medium text-foreground">Long-form story</span>
                                <span className="block text-[11px] text-foreground-subtle">One story-driven long read. Tell it the story in the box.</span>
                            </span>
                        </button>
                    </div>
                ) : (
                    entries.map(entry => (
                        <EntryView
                            key={entry.id}
                            entry={entry}
                            target={target}
                            showPrompt={showPromptFor === entry.id}
                            onTogglePrompt={() => setShowPromptFor(showPromptFor === entry.id ? null : entry.id)}
                            onOpenContext={onOpenContext}
                        />
                    ))
                )}
            </div>

            {/* Ask */}
            <div className="border-t border-border/50 px-3 py-2.5 space-y-2">
                {entries.length > 0 && !busy && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <FillMenu
                            variant="pill"
                            disabled={!canFill}
                            note={canFill ? `Writes ${countPhrase(toFill)} into its empty slots` : fillBlocked}
                            options={fillOptions}
                            onPick={fillWith}
                        />
                        <button
                            onClick={startStory}
                            disabled={!targetRow}
                            title="One story-driven long read. Tell it the story in the box."
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-purple-500/30 text-purple-200 hover:bg-purple-500/10 disabled:opacity-40 transition-colors"
                        >
                            <BookOpen className="w-3 h-3" /> Long-form story
                        </button>
                        {showFollowUps && followUps.map(s => (
                            <button
                                key={s.label}
                                onClick={() => write(s.text)}
                                disabled={!targetRow}
                                title={s.text}
                                className="px-2.5 py-1 rounded-full text-xs border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 disabled:opacity-40 transition-colors"
                            >
                                {s.label}
                            </button>
                        ))}
                        <button onClick={clearConversation} className="ml-auto px-2 py-1 text-xs text-foreground-subtle hover:text-foreground">
                            Start over
                        </button>
                    </div>
                )}
                {storyMode && (
                    <div className="flex items-center gap-1.5 text-xs text-purple-200">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="font-medium">Long-form story</span>
                        <button onClick={() => setStoryMode(false)} aria-label="Cancel long-form story" className="p-0.5 rounded text-foreground-subtle hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={instruction}
                        onChange={e => setInstruction(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                            if (e.key === 'Escape' && storyMode) setStoryMode(false);
                        }}
                        rows={storyMode ? 4 : 2}
                        placeholder={!targetRow ? 'Add a row to start writing'
                            : storyMode ? "What's the story? Who it's about, what happened, how the product fits…"
                                : `Ask for copy for ${rowLabel(targetRow, targetIndex)}…`}
                        disabled={!targetRow}
                        className="flex-1 min-h-9 max-h-40 px-3 py-2 rounded-lg bg-background-tertiary border border-border text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-purple-400 resize-y"
                    />
                    {busy ? (
                        <button
                            onClick={() => abortRef.current?.abort()}
                            className="h-9 px-3 rounded-lg border border-border text-sm text-foreground-muted hover:text-foreground flex items-center gap-1.5"
                        >
                            <Square className="w-3.5 h-3.5" /> Stop
                        </button>
                    ) : (
                        <button
                            onClick={send}
                            disabled={!targetRow || (storyMode && !typed)}
                            className="h-9 px-3 rounded-lg bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-sm font-medium text-white flex items-center gap-1.5 whitespace-nowrap"
                        >
                            <Send className="w-3.5 h-3.5" /> {storyMode ? 'Write story' : 'Write'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

// ─── Pieces ─────────────────────────────────────────────────────

interface FillOption {
    label: string;
    hint: string;
    /** The direction sent with Fill; empty for no particular angle. */
    text: string;
}

/** Fill this ad: opens a short menu of angles; a pick fills the ad straight away. */
function FillMenu({ variant, disabled, note, options, onPick }: {
    variant: 'card' | 'pill';
    disabled: boolean;
    /** What Fill will write, or why it can't. */
    note: string;
    options: FillOption[];
    onPick: (direction: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const toggle = () => setOpen(o => !o);
    return (
        <div ref={ref} className={variant === 'card' ? 'relative' : 'relative inline-block'}>
            {variant === 'card' ? (
                <button
                    onClick={toggle}
                    disabled={disabled}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className="w-full text-left flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/15 disabled:opacity-40 transition-colors"
                >
                    <Wand2 className="w-4 h-4 mt-0.5 shrink-0 text-purple-300" />
                    <span className="flex-1">
                        <span className="block text-xs font-medium text-purple-200">Fill this ad</span>
                        <span className="block text-[11px] text-foreground-subtle">{note}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 mt-0.5 shrink-0 text-purple-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <button
                    onClick={toggle}
                    disabled={disabled}
                    title={note}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 disabled:opacity-40 transition-colors"
                >
                    <Wand2 className="w-3 h-3" /> Fill this ad <ChevronDown className="w-3 h-3" />
                </button>
            )}
            {open && (
                <div
                    role="menu"
                    aria-label="Fill with"
                    className={`absolute z-30 max-h-[60vh] overflow-y-auto p-1 rounded-lg border border-border bg-surface-secondary shadow-2xl ${variant === 'card'
                        ? 'left-0 right-0 top-full mt-1'
                        : 'left-0 bottom-full mb-1 w-72'}`}
                >
                    <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-foreground-subtle">Fill with…</p>
                    {options.map(o => (
                        <button
                            key={o.label}
                            role="menuitem"
                            onClick={() => { setOpen(false); onPick(o.text); }}
                            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-purple-500/10 focus:bg-purple-500/10 focus:outline-none"
                        >
                            <span className="block text-sm text-foreground">{o.label}</span>
                            <span className="block text-xs text-foreground-subtle truncate">{o.hint}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function UsedLine({ used, onOpenContext }: { used: UsedContext; onOpenContext: () => void }) {
    const parts = [
        used.brand && 'Brand voice',
        used.notes && 'Notes',
        used.links > 0 && `${used.links} link${used.links === 1 ? '' : 's'}`,
        used.landing === 'read' && 'Landing page',
        used.topCopy > 0 && `${used.topCopy} top performers`,
    ].filter(Boolean);
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-foreground-subtle">
            <span>Used: {parts.length > 0 ? parts.join(' · ') : 'nothing beyond the row itself'}</span>
            {used.landing === 'failed' && <span className="text-amber-400">Landing page not used: {used.landingError}</span>}
            {used.linksNotRead > 0 && (
                <button onClick={onOpenContext} className="text-amber-400 hover:underline">
                    {used.linksNotRead} Context link{used.linksNotRead === 1 ? '' : 's'} not read
                </button>
            )}
            {used.links === 0 && used.linksNotRead === 0 && (
                <button onClick={onOpenContext} className="text-purple-300 hover:underline">Add product or landing page links</button>
            )}
        </div>
    );
}

function EntryView({ entry, target, showPrompt, onTogglePrompt, onOpenContext }: {
    entry: Entry;
    target: CopyTarget;
    showPrompt: boolean;
    onTogglePrompt: () => void;
    onOpenContext: () => void;
}) {
    const [useNote, showUseNote] = useUseNote();
    const groups = (['headline', 'primary_text'] as const).map(type => ({ type, style: COPY_TYPE[type] }));
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
                <span className="shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium">{entry.rowLabel}</span>
                <span className="text-foreground-muted truncate">{entry.instruction}</span>
                {entry.prompt && (
                    <button onClick={onTogglePrompt} className="ml-auto shrink-0 flex items-center gap-1 text-foreground-subtle hover:text-foreground" title="Show the prompt sent to Gemini">
                        <Code2 className="w-3 h-3" /> Prompt
                    </button>
                )}
            </div>

            {entry.used && <UsedLine used={entry.used} onOpenContext={onOpenContext} />}

            {showPrompt && entry.prompt && (
                <pre className="max-h-60 overflow-auto p-2 rounded bg-background text-[10px] leading-relaxed text-foreground-muted whitespace-pre-wrap border border-border">
                    {`SYSTEM\n${entry.prompt.system}\n\n${entry.prompt.messages.map(m => `${m.role.toUpperCase()}\n${m.content}`).join('\n\n')}`}
                    {entry.usage && `\n\n— ${entry.usage.model}: ${entry.usage.inputTokens.toLocaleString()} input tokens (${entry.usage.cachedTokens.toLocaleString()} cached), ${entry.usage.outputTokens.toLocaleString()} output`}
                </pre>
            )}

            {(entry.status === 'reading' || entry.status === 'writing') && (
                <div className="p-3 rounded-lg border border-purple-500/20 bg-background text-xs text-foreground-muted">
                    <div className="flex items-center gap-1.5 text-purple-300 mb-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {entry.status === 'reading' ? 'Reading the landing page…' : 'Writing…'}
                    </div>
                    {entry.raw && <p className="whitespace-pre-wrap font-mono text-[11px]">{entry.raw}</p>}
                </div>
            )}

            {entry.error && (
                <p className={`text-xs ${entry.status === 'error' ? 'text-red-400' : 'text-amber-400'}`}>{entry.error}</p>
            )}

            {entry.filled && (
                <p role="status" className={`flex items-center gap-1.5 text-xs ${entry.filled.ok ? 'text-green-400' : 'text-amber-400'}`}>
                    <Wand2 className="w-3 h-3 shrink-0" /> {entry.filled.message}
                </p>
            )}

            {entry.status === 'done' && entry.items.length > 0 && (
                <div className="grid grid-cols-1 @xl:grid-cols-2 gap-3">
                    {groups.map(group => {
                        const items = entry.items.filter(i => i.type === group.type);
                        if (items.length === 0) return null;
                        return (
                            <div key={group.type} className="space-y-1.5">
                                <p className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider ${group.style.text}`}>
                                    <group.style.icon className="w-3 h-3" /> {group.style.plural}
                                </p>
                                {items.map(item => (
                                    <Draggable key={item.id} item={item}>
                                        <div className={`group flex items-start gap-2 p-2.5 rounded-lg border bg-background transition-colors cursor-grab ${group.style.border}`}>
                                            <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">{item.text}</p>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                <UseButton item={item} target={target} onResult={r => showUseNote(item.id, r)} />
                                                {group.type === 'headline' && (
                                                    <span className={`text-[10px] ${item.text.length > 40 ? 'text-amber-400' : 'text-foreground-subtle'}`}>{item.text.length}</span>
                                                )}
                                            </div>
                                        </div>
                                        <UseNote note={useNote} id={item.id} />
                                    </Draggable>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
