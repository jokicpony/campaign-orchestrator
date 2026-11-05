/**
 * Turns Meta's top-spending ads into the Palette's Top performers: one entry per
 * distinct headline or primary text, with its spend summed across ads, keeping
 * only the copy behind most of the spend. Pure, so the offline tests load it.
 */
import type { MetaTopPerformer } from './types';

/** Keep the copy that together makes up this share of a type's spend... */
export const TOP_COPY_SPEND_SHARE = 0.8;
/** ...and no more than this many of each type, so the list stays scannable. */
export const TOP_COPY_MAX_PER_TYPE = 15;

export type TopCopyType = 'headline' | 'primary_text';

export interface TopCopy {
    type: TopCopyType;
    text: string;
    spend: number;
    impressions: number;
    clicks: number;
    /** Clicks / impressions, in percent. */
    ctr: number;
    /** Spend-weighted across the ads that report it. */
    roas?: number;
    adNames: string[];
}

export interface TopCopyResult {
    items: TopCopy[];
    /** Ads that matched the product filter (all ads when there is none). */
    matchedAds: number;
    /** Distinct copies found before the cut, by type. */
    found: Record<TopCopyType, number>;
}

/** Case-insensitive match on the ad or campaign name; an empty filter matches everything. */
export function matchesProduct(ad: Pick<MetaTopPerformer, 'adName' | 'campaignName'>, filter?: string): boolean {
    const f = filter?.trim().toLowerCase();
    if (!f) return true;
    return ad.adName.toLowerCase().includes(f) || ad.campaignName.toLowerCase().includes(f);
}

interface Acc { text: string; spend: number; impressions: number; clicks: number; roasSpend: number; roasWeight: number; adNames: Set<string> }

const keyFor = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** Keep the biggest spenders until they cover `share` of the type's spend, capped at `max`. */
export function cutBySpend<T extends { spend: number }>(sorted: T[], share = TOP_COPY_SPEND_SHARE, max = TOP_COPY_MAX_PER_TYPE): T[] {
    const total = sorted.reduce((sum, i) => sum + i.spend, 0);
    if (total <= 0) return [];
    const kept: T[] = [];
    let covered = 0;
    for (const item of sorted) {
        if (kept.length >= max || covered >= total * share) break;
        kept.push(item);
        covered += item.spend;
    }
    return kept;
}

export function aggregateTopCopy(ads: MetaTopPerformer[], filter?: string): TopCopyResult {
    const matched = ads.filter(ad => matchesProduct(ad, filter));
    const maps: Record<TopCopyType, Map<string, Acc>> = { headline: new Map(), primary_text: new Map() };

    for (const ad of matched) {
        const pieces: [TopCopyType, string | null][] = [['headline', ad.headline], ['primary_text', ad.primaryText]];
        for (const [type, raw] of pieces) {
            const text = raw?.trim();
            if (!text) continue;
            const key = keyFor(text);
            const acc = maps[type].get(key) ?? { text, spend: 0, impressions: 0, clicks: 0, roasSpend: 0, roasWeight: 0, adNames: new Set<string>() };
            acc.spend += ad.spend || 0;
            acc.impressions += ad.impressions || 0;
            acc.clicks += ad.clicks || 0;
            if (ad.roas && ad.spend > 0) { acc.roasSpend += ad.roas * ad.spend; acc.roasWeight += ad.spend; }
            acc.adNames.add(ad.adName);
            maps[type].set(key, acc);
        }
    }

    const items: TopCopy[] = [];
    for (const type of ['headline', 'primary_text'] as const) {
        const sorted = [...maps[type].values()].filter(a => a.spend > 0).sort((a, b) => b.spend - a.spend);
        for (const a of cutBySpend(sorted)) {
            items.push({
                type,
                text: a.text,
                spend: a.spend,
                impressions: a.impressions,
                clicks: a.clicks,
                ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
                roas: a.roasWeight > 0 ? a.roasSpend / a.roasWeight : undefined,
                adNames: [...a.adNames],
            });
        }
    }
    return {
        items: items.sort((a, b) => b.spend - a.spend),
        matchedAds: matched.length,
        found: { headline: maps.headline.size, primary_text: maps.primary_text.size },
    };
}
