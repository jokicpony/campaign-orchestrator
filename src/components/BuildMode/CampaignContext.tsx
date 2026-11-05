'use client';

import React, { useCallback, useState } from 'react';
import { ChevronUp, Link2, RefreshCw, X } from 'lucide-react';
import type { CampaignBrief } from '@/types';
import type { CopyContextPage } from '@/types/copywriter';
import { fetchContextPages } from '@/lib/ai/copywriter';
import { normalizePageUrl } from '@/lib/ai/rowContext';

export const MAX_CONTEXT_LINKS = 5;
const MAX_STORED_PAGES = 20;

export interface OtherCampaign {
    id: string;
    name: string;
    brief?: CampaignBrief;
}

/** Notes for the copywriter, falling back to the old brief's audience field. */
export function notesFor(brief: CampaignBrief): string {
    if (brief.keyMessages?.trim()) return brief.keyMessages;
    return brief.targetAudience?.trim() ? `Audience: ${brief.targetAudience.trim()}` : '';
}

/** Store freshly read pages: Context links always stay; row pages beyond the cap drop oldest first. */
export function upsertPages(existing: CopyContextPage[], fresh: CopyContextPage[], keep: string[]): CopyContextPage[] {
    const byUrl = new Map(existing.map(p => [normalizePageUrl(p.url), p]));
    for (const page of fresh) byUrl.set(normalizePageUrl(page.url), page);
    const keepSet = new Set(keep.map(normalizePageUrl));
    const all = [...byUrl.values()].sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
    const pinned = all.filter(p => keepSet.has(normalizePageUrl(p.url)));
    const others = all.filter(p => !keepSet.has(normalizePageUrl(p.url)));
    return [...pinned, ...others.slice(-(MAX_STORED_PAGES - pinned.length))];
}

function pageIn(brief: CampaignBrief, url: string): CopyContextPage | undefined {
    return (brief.contextPages ?? []).find(p => normalizePageUrl(p.url) === normalizePageUrl(url));
}

/** The Assembly Line header button: what the campaign's context holds, at a glance. */
export function CampaignContextButton({ brief, open, onToggle }: {
    brief: CampaignBrief;
    open: boolean;
    onToggle: () => void;
}) {
    const links = brief.contextLinks ?? [];
    const ready = links.filter(l => pageIn(brief, l)?.text).length;
    const label = links.length > 0 ? `Campaign Context · ${ready}/${links.length}` : 'Campaign Context';
    return (
        <button
            onClick={onToggle}
            aria-expanded={open}
            title="Links and notes the copywriter reads for every ad in this campaign"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${open
                ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                : 'border-border text-foreground-muted hover:text-foreground hover:border-purple-500/40'}`}
        >
            <Link2 className="w-4 h-4" />
            {label}
            {links.length > ready && !open && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="A link isn't read yet" />}
        </button>
    );
}

/**
 * The campaign's context: up to 5 links (read once by the server, stored in
 * `brief.contextPages`) and free-text notes. The copywriter reads them for
 * every ad in the campaign. Stays mounted while closed so a read in progress
 * still shows as reading when it's reopened.
 */
export function CampaignContextPanel({ brief, onBriefChange, otherCampaigns, open, onClose }: {
    brief: CampaignBrief;
    /** Functional update so async page reads never overwrite newer edits. */
    onBriefChange: (update: (brief: CampaignBrief) => CampaignBrief) => void;
    otherCampaigns: OtherCampaign[];
    open: boolean;
    onClose: () => void;
}) {
    const [linkInput, setLinkInput] = useState('');
    const [linkError, setLinkError] = useState<string | null>(null);
    const [readingLinks, setReadingLinks] = useState<string[]>([]);

    const links = brief.contextLinks ?? [];
    const notes = notesFor(brief);
    const copyable = otherCampaigns.filter(c => (c.brief?.contextLinks?.length ?? 0) > 0 || !!c.brief?.keyMessages?.trim());

    const readLinks = useCallback(async (urls: string[]) => {
        setReadingLinks(prev => [...prev, ...urls]);
        try {
            const fresh = await fetchContextPages(urls);
            onBriefChange(b => ({ ...b, contextPages: upsertPages(b.contextPages ?? [], fresh, b.contextLinks ?? []) }));
        } catch (err) {
            setLinkError(err instanceof Error ? err.message : 'Could not read the page');
        } finally {
            setReadingLinks(prev => prev.filter(u => !urls.includes(u)));
        }
    }, [onBriefChange]);

    const addLink = () => {
        setLinkError(null);
        let url = linkInput.trim();
        if (!url) return;
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try { new URL(url); } catch { setLinkError("That doesn't look like a link"); return; }
        if (links.length >= MAX_CONTEXT_LINKS) { setLinkError(`Up to ${MAX_CONTEXT_LINKS} links`); return; }
        if (links.some(l => normalizePageUrl(l) === normalizePageUrl(url))) { setLinkInput(''); return; }
        setLinkInput('');
        onBriefChange(b => ({ ...b, contextLinks: [...(b.contextLinks ?? []), url] }));
        readLinks([url]);
    };

    const removeLink = (url: string) => {
        onBriefChange(b => ({
            ...b,
            contextLinks: (b.contextLinks ?? []).filter(l => l !== url),
            contextPages: (b.contextPages ?? []).filter(p => normalizePageUrl(p.url) !== normalizePageUrl(url)),
        }));
    };

    const copyFrom = (campaignId: string) => {
        const source = otherCampaigns.find(c => c.id === campaignId)?.brief;
        if (!source) return;
        const sourceLinks = (source.contextLinks ?? []).slice(0, MAX_CONTEXT_LINKS);
        const keep = new Set(sourceLinks.map(normalizePageUrl));
        onBriefChange(b => ({
            ...b,
            keyMessages: notesFor(source),
            contextLinks: sourceLinks,
            contextPages: (source.contextPages ?? []).filter(p => keep.has(normalizePageUrl(p.url))),
        }));
    };

    if (!open) return null;

    return (
        <div className="@container flex-shrink-0 max-h-[55vh] overflow-y-auto px-6 pl-5 py-4 border-b border-purple-500/20 bg-purple-500/[0.03]">
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-foreground">Campaign Context</h3>
                    <p className="text-[11px] text-foreground-subtle">The copywriter reads these for every ad in this campaign.</p>
                </div>
                <button onClick={onClose} className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors">
                    <ChevronUp className="w-3.5 h-3.5" /> Done
                </button>
            </div>
            <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">Links <span className="text-foreground-subtle font-normal">· product pages, landing pages, reviews</span></p>
                        <span className="text-[10px] text-foreground-subtle">{links.length} / {MAX_CONTEXT_LINKS}</span>
                    </div>
                    {links.map(url => (
                        <ContextLink
                            key={url}
                            url={url}
                            page={pageIn(brief, url)}
                            reading={readingLinks.includes(url)}
                            onRefresh={() => readLinks([url])}
                            onRemove={() => removeLink(url)}
                        />
                    ))}
                    {links.length < MAX_CONTEXT_LINKS && (
                        <div className="flex gap-2">
                            <input
                                value={linkInput}
                                onChange={e => setLinkInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addLink(); }}
                                placeholder="Paste a link…"
                                aria-label="Add a context link"
                                className="flex-1 h-8 px-3 rounded-lg bg-background-tertiary border border-border text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-purple-400"
                            />
                            <button onClick={addLink} disabled={!linkInput.trim()} className="h-8 px-3 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 disabled:opacity-40">
                                Add
                            </button>
                        </div>
                    )}
                    {linkError && <p className="text-[11px] text-amber-400">{linkError}</p>}
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-foreground">Notes <span className="text-foreground-subtle font-normal">· anything the pages don&apos;t say</span></p>
                        {copyable.length > 0 && (
                            <select
                                value=""
                                onChange={e => { if (e.target.value) copyFrom(e.target.value); }}
                                className="h-7 px-2 rounded-md bg-background-tertiary border border-border text-[11px] text-foreground-muted"
                                aria-label="Copy context from another campaign"
                            >
                                <option value="">Copy from campaign…</option>
                                {copyable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        )}
                    </div>
                    <textarea
                        value={notes}
                        onChange={e => onBriefChange(b => ({ ...b, keyMessages: e.target.value.slice(0, 10000), targetAudience: '' }))}
                        placeholder="Offer, audience, dates, approved claims, what to avoid…"
                        aria-label="Campaign notes"
                        className="w-full h-36 px-3 py-2 rounded-lg bg-background-tertiary border border-border text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none focus:border-purple-400 resize-y"
                    />
                </div>
            </div>
        </div>
    );
}

function ContextLink({ url, page, reading, onRefresh, onRemove }: {
    url: string;
    page: CopyContextPage | undefined;
    reading: boolean;
    onRefresh: () => void;
    onRemove: () => void;
}) {
    const [open, setOpen] = useState(false);
    const hasText = !!page?.text && !page.error;
    return (
        <div className="p-2 rounded-lg border border-border bg-background">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{page?.title || url}</p>
                    <p className="text-[10px] truncate text-foreground-subtle">{url}</p>
                    <p className={`text-[10px] ${page?.error ? 'text-amber-400' : 'text-foreground-subtle'}`}>
                        {reading ? 'Reading…'
                            : page?.error ? page.error
                                : page ? `${page.summarized ? 'Summarized' : 'Read'} ${new Date(page.fetchedAt).toLocaleDateString()} · ${page.text.length.toLocaleString()} characters`
                                    : 'Not read yet'}
                        {hasText && !reading && (
                            <button onClick={() => setOpen(!open)} className="ml-2 text-purple-300 hover:underline">
                                {open ? 'Hide' : page.summarized ? 'Show fact sheet' : 'Show text'}
                            </button>
                        )}
                    </p>
                </div>
                <button onClick={onRefresh} disabled={reading} title="Read again" className="p-1 text-foreground-subtle hover:text-foreground disabled:opacity-40">
                    <RefreshCw className={`w-3.5 h-3.5 ${reading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onRemove} title="Remove" className="p-1 text-foreground-subtle hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            {open && hasText && (
                <pre className="mt-2 max-h-64 overflow-auto p-2 rounded bg-background-tertiary text-[11px] leading-relaxed text-foreground-muted whitespace-pre-wrap font-sans">
                    {page.text}
                </pre>
            )}
        </div>
    );
}
