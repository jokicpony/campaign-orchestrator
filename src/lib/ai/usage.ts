/**
 * AI usage and estimated cost, shared by the server (which records each call)
 * and Settings → Usage (which shows the totals). No runtime imports, so the
 * offline tests can load it.
 *
 * Prices are Google's list prices for the paid tier, in USD per 1M tokens
 * (https://ai.google.dev/gemini-api/docs/pricing, checked 2 Nov 2026). Output
 * includes thinking tokens. A cost is worked out when the call is recorded,
 * at that day's price, so a price change never rewrites past months. Google
 * Cloud billing has the real bill; these are estimates.
 */

/** What a call was for. */
export type UsageKind = 'write' | 'fill' | 'story' | 'page';
export const USAGE_KINDS: UsageKind[] = ['write', 'fill', 'story', 'page'];
export const USAGE_KIND_LABEL: Record<UsageKind, string> = {
    write: 'Copywriter asks',
    fill: 'Fill this ad',
    story: 'Long-form stories',
    page: 'Page summaries',
};

export interface UsageTotals {
    calls: number;
    inputTokens: number;
    /** Part of inputTokens that Gemini's cache served at the cached price. */
    cachedTokens: number;
    outputTokens: number;
    /** Estimated cost in millionths of a dollar (0 for a model with no price). */
    costMicros: number;
}

/** One person's calls and estimated cost, keyed by uid. */
export interface UsagePerson {
    email?: string;
    calls: number;
    costMicros: number;
}

/** One model's totals for one UTC day, by kind and by person (the whole team). */
export interface UsageDay {
    day: string; // YYYY-MM-DD (UTC)
    model: string;
    priced: boolean;
    kinds: Partial<Record<UsageKind, UsageTotals>>;
    people: Record<string, UsagePerson>;
}

interface Price {
    /** First UTC day (YYYY-MM-DD) this price applies; the first entry has none. */
    from?: string;
    input: number;
    cachedInput: number;
    output: number;
}

const PRICES: Record<string, Price[]> = {
    'gemini-4-argon': [
        { input: 2, cachedInput: 0.1, output: 10 },
        { from: '2026-12-01', input: 4, cachedInput: 0.2, output: 20 },
    ],
    'gemini-3.8-flash': [
        { input: 0.75, cachedInput: 0.075, output: 3.75 },
        { from: '2027-01-01', input: 1.5, cachedInput: 0.15, output: 7.5 },
    ],
};

/** The price for a model on a UTC day (YYYY-MM-DD), or null if we have none. */
export function priceFor(model: string, day: string): Omit<Price, 'from'> | null {
    const periods = PRICES[model];
    if (!periods) return null;
    let current = periods[0];
    for (const p of periods) if (!p.from || p.from <= day) current = p;
    return { input: current.input, cachedInput: current.cachedInput, output: current.output };
}

export function hasPrice(model: string): boolean {
    return model in PRICES;
}

/** Estimated cost of one call in millionths of a dollar. Cached tokens are part of the input count. */
export function costMicros(model: string, day: string, t: { inputTokens: number; cachedTokens: number; outputTokens: number }): number {
    const price = priceFor(model, day);
    if (!price) return 0;
    const cached = Math.min(t.cachedTokens, t.inputTokens);
    // Tokens × dollars per million tokens = millionths of a dollar.
    return Math.round((t.inputTokens - cached) * price.input + cached * price.cachedInput + t.outputTokens * price.output);
}

/** UTC day key, e.g. "2026-11-02". */
export function dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** The first day of a window of `days` days ending today (UTC), e.g. 7 → today and the 6 days before. */
export function windowStart(today: string, days: number): string {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    return dayKey(d);
}

/** Firestore document id for a model's day (ids can't hold "/"). */
export function usageDocId(day: string, model: string): string {
    return `${day}_${model.replace(/[^A-Za-z0-9.-]/g, '_')}`;
}

/** Days kept in Settings → Usage's longest window. */
export const USAGE_WINDOW_DAYS = 30;

export function sumTotals(list: (UsageTotals | undefined)[]): UsageTotals {
    const out: UsageTotals = { calls: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, costMicros: 0 };
    for (const t of list) {
        if (!t) continue;
        out.calls += t.calls;
        out.inputTokens += t.inputTokens;
        out.cachedTokens += t.cachedTokens;
        out.outputTokens += t.outputTokens;
        out.costMicros += t.costMicros;
    }
    return out;
}
