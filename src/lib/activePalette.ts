import type { AdRow, CopyItem } from '@/types';

/**
 * The Active Palette's view: which ads use each piece of copy, and the
 * filters and sorts that keep a big campaign's list readable.
 */

export interface CopyUsage {
    /** Slots holding this copy, across every ad. */
    slots: number;
    /** Ads holding it, in Assembly Line order, each once. */
    rowIds: string[];
}

/** Usage of each Active item. Carousels publish only Primary Text 1, so copy parked in slots 2–5 doesn't count. */
export function copyUsage(rows: AdRow[], active: CopyItem[]): Map<string, CopyUsage> {
    const usage = new Map<string, CopyUsage>();
    active.forEach(item => usage.set(item.id, { slots: 0, rowIds: [] }));
    rows.forEach(row => {
        const primaryTexts = row.adType === 'carousel' ? row.slots.primaryTexts.slice(0, 1) : row.slots.primaryTexts;
        [...primaryTexts, ...row.slots.headlines].forEach(slot => {
            const entry = slot ? usage.get(slot.masterItem.id) : undefined;
            if (!entry) return;
            entry.slots += 1;
            if (entry.rowIds[entry.rowIds.length - 1] !== row.id) entry.rowIds.push(row.id);
        });
    });
    return usage;
}

export type SourceFilter = 'all' | CopyItem['source'];
export type ActiveSort = 'used' | 'newest' | 'performance';

export interface ActiveView {
    type: 'all' | CopyItem['type'];
    source: SourceFilter;
    sort: ActiveSort;
    /** Only copy in the selected ad. */
    thisAd: boolean;
    query: string;
    showUnused: boolean;
}

export const DEFAULT_ACTIVE_VIEW: ActiveView = {
    type: 'all', source: 'all', sort: 'used', thisAd: false, query: '', showUnused: false,
};

/** True when anything narrows the list (the type toggle and sort don't count). */
export function isFiltered(view: ActiveView): boolean {
    return view.source !== 'all' || view.thisAd || view.query.trim() !== '';
}

/** Search shows once the list is this long (or while a search is typed). */
export const SEARCH_FROM = 15;

/**
 * Filter and sort Active, split into copy in at least one ad and copy in none.
 * Newest is the order copy joined Active (it's appended), newest first.
 * Top performance ranks by spend, then ROAS; copy without metrics goes last.
 */
export function arrangeActive(
    items: CopyItem[],
    usage: Map<string, CopyUsage>,
    view: ActiveView,
    targetRowId: string | null,
): { inUse: CopyItem[]; unused: CopyItem[] } {
    const query = view.query.trim().toLowerCase();
    const order = new Map(items.map((item, i) => [item.id, i]));
    const slots = (item: CopyItem) => usage.get(item.id)?.slots ?? 0;
    const newer = (a: CopyItem, b: CopyItem) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
    const metric = (n: number | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : -1);

    const compare = (a: CopyItem, b: CopyItem): number => {
        if (view.sort === 'newest') return newer(a, b);
        if (view.sort === 'performance') {
            return metric(b.metrics?.spend) - metric(a.metrics?.spend)
                || metric(b.metrics?.roas) - metric(a.metrics?.roas)
                || slots(b) - slots(a)
                || newer(a, b);
        }
        return slots(b) - slots(a) || newer(a, b);
    };

    const shown = items.filter(item =>
        (view.type === 'all' || item.type === view.type)
        && (view.source === 'all' || item.source === view.source)
        && (!query || item.text.toLowerCase().includes(query))
        && (!view.thisAd || !targetRowId || (usage.get(item.id)?.rowIds.includes(targetRowId) ?? false)),
    ).sort(compare);

    return {
        inUse: shown.filter(item => slots(item) > 0),
        unused: shown.filter(item => slots(item) === 0),
    };
}
