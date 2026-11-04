/**
 * Offline checks for the Active Palette view: usage per ad, In use / Unused,
 * source and "This ad" filters, search, and the three sorts.
 * Run: node --experimental-strip-types --no-warnings scripts/test-active-palette.mts
 */
import assert from 'node:assert/strict';
import { arrangeActive, copyUsage, DEFAULT_ACTIVE_VIEW, type ActiveView } from '../src/lib/activePalette.ts';
import type { AdRow, CopyItem } from '../src/types/index.ts';

const copy = (id: string, over: Partial<CopyItem> = {}): CopyItem => ({
    id, text: `Copy ${id}`, type: 'headline', source: 'manual', createdAt: new Date(), ...over,
});
const slot = (item: CopyItem) => ({ masterItem: item, isCustomized: false });
const row = (id: string, adType: string, headlines: (CopyItem | null)[], primaryTexts: (CopyItem | null)[]) =>
    ({ id, adType, slots: { headlines: headlines.map(h => h && slot(h)), primaryTexts: primaryTexts.map(p => p && slot(p)) } }) as unknown as AdRow;

const a = copy('a');
const b = copy('b', { source: 'historical', metrics: { spend: 500, roas: 2 } });
const c = copy('c', { type: 'primary_text', source: 'ai_generated', text: 'Free shipping this week' });
const d = copy('d', { source: 'historical', metrics: { spend: 900 } });
const e = copy('e', { type: 'primary_text' });
const items = [a, b, c, d, e];

const rows = [
    row('r1', 'single_image', [a, b], [c]),
    row('r2', 'carousel', [a, a], [null, e]), // carousel: PT 2 doesn't publish
    row('r3', 'single_image', [a], [c]),
];
const usage = copyUsage(rows, items);

// Slots count every slot; ads are listed once each, in row order
assert.deepEqual(usage.get('a'), { slots: 4, rowIds: ['r1', 'r2', 'r3'] });
assert.deepEqual(usage.get('c'), { slots: 2, rowIds: ['r1', 'r3'] });
assert.deepEqual(usage.get('e'), { slots: 0, rowIds: [] });
assert.equal(usage.get('d')?.slots, 0);

const view = (over: Partial<ActiveView> = {}) => ({ ...DEFAULT_ACTIVE_VIEW, ...over });
const ids = (list: CopyItem[]) => list.map(i => i.id);

// Default: most used first; unused split off (newest first on a tie)
let r = arrangeActive(items, usage, view(), null);
assert.deepEqual(ids(r.inUse), ['a', 'c', 'b']);
assert.deepEqual(ids(r.unused), ['e', 'd']);

// Newest = order joined, newest first
r = arrangeActive(items, usage, view({ sort: 'newest' }), null);
assert.deepEqual(ids(r.inUse), ['c', 'b', 'a']);

// Top performance: spend, then ROAS; no metrics last
r = arrangeActive(items, usage, view({ sort: 'performance' }), null);
assert.deepEqual(ids(r.inUse), ['b', 'a', 'c']);
assert.deepEqual(ids(r.unused), ['d', 'e']);

// Source and type filters
r = arrangeActive(items, usage, view({ source: 'historical' }), null);
assert.deepEqual([...ids(r.inUse), ...ids(r.unused)], ['b', 'd']);
r = arrangeActive(items, usage, view({ type: 'primary_text' }), null);
assert.deepEqual([...ids(r.inUse), ...ids(r.unused)], ['c', 'e']);

// This ad: only copy in the selected ad (ignored with no ad selected)
r = arrangeActive(items, usage, view({ thisAd: true }), 'r2');
assert.deepEqual(ids(r.inUse), ['a']);
assert.deepEqual(ids(r.unused), []);
r = arrangeActive(items, usage, view({ thisAd: true }), null);
assert.equal(r.inUse.length + r.unused.length, 5);

// Search: any case, trimmed
r = arrangeActive(items, usage, view({ query: '  SHIPPING ' }), null);
assert.deepEqual(ids(r.inUse), ['c']);

console.log('active palette: ok');
