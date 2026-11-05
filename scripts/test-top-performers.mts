/**
 * Offline checks for turning Meta's top-spending ads into the Palette's Top
 * performers: product filter, merging copy across ads, and the spend cut.
 * Run: node --experimental-strip-types --no-warnings scripts/test-top-performers.mts
 */
import assert from 'node:assert/strict';
import { aggregateTopCopy, cutBySpend, matchesProduct, TOP_COPY_MAX_PER_TYPE } from '../src/lib/meta/topCopy.ts';
import type { MetaTopPerformer } from '../src/lib/meta/types.ts';

const ad = (over: Partial<MetaTopPerformer>): MetaTopPerformer => ({
    adId: 'a', adName: 'Summit_Gift_1x1', campaignName: 'Holiday', primaryText: null, headline: null,
    callToAction: null, destinationUrl: null, spend: 0, impressions: 0, clicks: 0, ctr: 0, ...over,
});

// Product filter: ad or campaign name, any case; blank matches all
assert.equal(matchesProduct(ad({}), 'summit'), true);
assert.equal(matchesProduct(ad({ adName: 'Toast', campaignName: 'SUMMIT push' }), 'Summit'), true);
assert.equal(matchesProduct(ad({}), 'tent'), false);
assert.equal(matchesProduct(ad({}), '  '), true);

// Spend cut: biggest first until 80% of spend is covered (the item that crosses it stays)
const spends = (xs: number[]) => xs.map(spend => ({ spend }));
assert.deepEqual(cutBySpend(spends([500, 300, 100, 50, 50])).map(i => i.spend), [500, 300]);   // 80% of 1000
assert.deepEqual(cutBySpend(spends([400, 300, 200, 100])).map(i => i.spend), [400, 300, 200]);  // 70% < 80%, so 200 joins
assert.deepEqual(cutBySpend(spends([10])).map(i => i.spend), [10]);
assert.deepEqual(cutBySpend(spends([0, 0])), []);
assert.equal(cutBySpend(spends(Array(40).fill(1))).length, TOP_COPY_MAX_PER_TYPE);         // flat spend: capped

// Merge the same copy across ads (whitespace and case), per type, spend-weighted ROAS
const ads = [
    ad({ adName: 'Summit_A', headline: 'Gear anywhere', primaryText: 'A whole day, one bag.', spend: 600, impressions: 30000, clicks: 600, roas: 3 }),
    ad({ adName: 'Summit_B', headline: 'gear  anywhere ', primaryText: 'Gift it.', spend: 200, impressions: 10000, clicks: 100, roas: 1 }),
    ad({ adName: 'Summit_C', headline: 'Tiny spender', primaryText: 'A whole day, one bag.', spend: 5, impressions: 100, clicks: 1 }),
    ad({ adName: 'Toast_D', headline: 'Other product', primaryText: 'Other text', spend: 900 }),
    ad({ adName: 'Summit_E', headline: 'No spend yet', spend: 0 }),
];
const all = aggregateTopCopy(ads);
assert.equal(all.matchedAds, 5);
assert.deepEqual(all.found, { headline: 4, primary_text: 3 });
const summit = aggregateTopCopy(ads, 'summit');
assert.equal(summit.matchedAds, 4);
const heads = summit.items.filter(i => i.type === 'headline');
assert.deepEqual(heads.map(h => h.text), ['Gear anywhere']);                                  // 800 of 805 covers 80%
assert.equal(heads[0].spend, 800);
assert.equal(heads[0].roas, 2.5);                                                            // (3×600 + 1×200) / 800
assert.ok(Math.abs(heads[0].ctr - 1.75) < 1e-9);                                            // 700 / 40000 clicks per impression
assert.deepEqual(heads[0].adNames, ['Summit_A', 'Summit_B']);
const texts = summit.items.filter(i => i.type === 'primary_text');
assert.deepEqual(texts.map(t => [t.text, t.spend]), [['A whole day, one bag.', 605], ['Gift it.', 200]]); // 605 of 805 is 75%, so the next joins
assert.deepEqual(summit.items.map(i => i.spend), [800, 605, 200]);                         // biggest spend first, both types

console.log('top performers: all checks passed');
