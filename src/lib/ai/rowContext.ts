/**
 * Build the copywriter's view of a row, and place chosen copy into it.
 * Types-only imports so the offline tests can load this file.
 */
import type { AdRow, SlotItem } from '../../types';
import type { CopyContextPage, CopyRowContext } from '../../types/copywriter';

/** Same page whatever the tracking params or trailing slash. */
export function normalizePageUrl(raw: string): string {
    try {
        const url = new URL(raw.trim());
        url.hash = '';
        for (const key of [...url.searchParams.keys()]) {
            if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
        }
        if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
        return url.toString();
    } catch {
        return raw.trim();
    }
}

export function rowLabel(row: AdRow, index: number): string {
    return `${String(index + 1).padStart(2, '0')} · ${row.angleName?.trim() || 'Untitled'}`;
}

function slotText(slot: SlotItem): string {
    return (slot.isCustomized && slot.localText ? slot.localText : slot.masterItem.text).trim();
}

export function rowContextFor(row: AdRow, index: number, pages: CopyContextPage[]): CopyRowContext {
    const winners: CopyRowContext['winners'] = [];
    const existing: CopyRowContext['existing'] = [];
    const collect = (slots: (SlotItem | null)[], type: 'headline' | 'primary_text') => {
        for (const slot of slots) {
            if (!slot) continue;
            const text = slotText(slot);
            if (!text) continue;
            if (slot.masterItem.source === 'historical') {
                winners.push({ type, text, spend: slot.masterItem.metrics?.spend, ctr: slot.masterItem.metrics?.ctr });
            } else {
                existing.push({ type, text });
            }
        }
    };
    collect(row.slots.headlines, 'headline');
    collect(row.slots.primaryTexts, 'primary_text');

    const url = row.slots.destinationUrl?.trim() || null;
    const page = url ? pages.find(p => p.text && normalizePageUrl(p.url) === normalizePageUrl(url)) : undefined;

    return {
        label: rowLabel(row, index),
        adType: row.adType,
        cardCount: row.adType === 'carousel' ? row.assets.length : undefined,
        callToAction: row.callToAction,
        destinationUrl: url,
        winners,
        existing,
        destinationPage: page ? { title: page.title, text: page.text } : undefined,
    };
}

export type PlaceResult =
    | { ok: true; slotIndex: number }
    | { ok: false; reason: 'duplicate' | 'full' };

/**
 * Where copy of this type would go in the row: the first empty slot that
 * publishes. Carousels publish only Primary Text 1, so that's the only
 * primary-text slot offered. Never overwrites a filled slot.
 */
export function findSlotFor(row: AdRow, type: 'headline' | 'primary_text', text: string): PlaceResult {
    const slots = type === 'headline' ? row.slots.headlines : row.slots.primaryTexts;
    const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
    if (slots.some(s => s && norm(slotText(s)) === norm(text))) return { ok: false, reason: 'duplicate' };
    // Carousels publish one headline per card (at least 2) and Primary Text 1 only.
    const usable = row.adType !== 'carousel' ? slots.length
        : type === 'primary_text' ? 1
            : Math.max(2, Math.min(row.assets.length, slots.length));
    const slotIndex = slots.slice(0, usable).findIndex(s => !s);
    return slotIndex === -1 ? { ok: false, reason: 'full' } : { ok: true, slotIndex };
}
