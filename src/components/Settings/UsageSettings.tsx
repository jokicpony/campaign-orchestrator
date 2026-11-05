'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { authedFetch } from '@/lib/api/authedFetch';
import { sumTotals, USAGE_KIND_LABEL, USAGE_KINDS, windowStart, type UsageDay, type UsageKind, type UsageTotals } from '@/lib/ai/usage';

interface UsageResponse {
    today: string;
    usage: UsageDay[];
    error?: string;
}

const WINDOWS = [7, 30];

/** One model's totals over the window, by kind. */
interface ModelRow {
    model: string;
    priced: boolean;
    kinds: Partial<Record<UsageKind, UsageTotals>>;
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function money(micros: number): string {
    if (micros === 0) return '$0';
    const dollars = micros / 1e6;
    return dollars < 0.01 ? '<$0.01' : `$${dollars.toFixed(2)}`;
}

function cacheShare(t: UsageTotals): string {
    return t.inputTokens > 0 ? `${Math.round((t.cachedTokens / t.inputTokens) * 100)}%` : '–';
}


/** Settings → Usage: the team's AI calls and estimated cost, this month and last. */
export function UsageSettings() {
    const [data, setData] = useState<UsageResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [days, setDays] = useState(WINDOWS[0]);

    useEffect(() => {
        let cancelled = false;
        authedFetch('/api/ai/usage')
            .then(async res => {
                const body = await res.json().catch(() => ({})) as UsageResponse;
                if (cancelled) return;
                if (!res.ok) setError(body.error || "Couldn't load usage.");
                else setData(body);
            })
            .catch(() => { if (!cancelled) setError("Couldn't load usage."); });
        return () => { cancelled = true; };
    }, []);

    const from = data ? windowStart(data.today, days) : '';
    const inWindow = (data?.usage ?? []).filter(u => u.day >= from);
    const byModel = new Map<string, ModelRow>();
    for (const u of inWindow) {
        const row = byModel.get(u.model) ?? { model: u.model, priced: u.priced, kinds: {} };
        for (const k of USAGE_KINDS) if (u.kinds[k]) row.kinds[k] = sumTotals([row.kinds[k], u.kinds[k]]);
        byModel.set(u.model, row);
    }
    const rows = [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model));
    const allTotals = sumTotals(rows.flatMap(r => USAGE_KINDS.map(k => r.kinds[k])));
    const people = new Map<string, { email?: string; calls: number; costMicros: number }>();
    for (const r of inWindow) {
        for (const [uid, p] of Object.entries(r.people)) {
            const cur = people.get(uid) ?? { email: p.email, calls: 0, costMicros: 0 };
            cur.email = cur.email ?? p.email;
            cur.calls += p.calls ?? 0;
            cur.costMicros += p.costMicros ?? 0;
            people.set(uid, cur);
        }
    }
    const peopleRows = [...people.entries()].sort((a, b) => b[1].costMicros - a[1].costMicros);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-400" /> Usage
                </h3>
                <p className="text-sm text-foreground-muted">
                    AI calls by the whole team. Costs are estimates from Google&apos;s list prices; Google Cloud billing has the exact bill.
                </p>
            </div>

            {error && <p className="text-sm text-accent-error">{error}</p>}
            {!data && !error && <p className="text-sm text-foreground-subtle">Loading…</p>}

            {data && (
                <>
                    <div className="flex items-center gap-1 p-0.5 rounded-lg bg-background-tertiary w-fit" role="radiogroup" aria-label="Period">
                        {WINDOWS.map(n => (
                            <button
                                key={n}
                                role="radio"
                                aria-checked={days === n}
                                onClick={() => setDays(n)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${days === n ? 'bg-background text-foreground' : 'text-foreground-muted hover:text-foreground'}`}
                            >
                                Last {n} days
                            </button>
                        ))}
                    </div>

                    {rows.length === 0 ? (
                        <p className="text-sm text-foreground-subtle">No AI calls in the last {days} days. Counting started on 2 Nov 2026.</p>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                                <span><span className="text-foreground-muted">Estimated cost </span><span className="font-semibold text-foreground">{money(allTotals.costMicros)}</span></span>
                                <span><span className="text-foreground-muted">Calls </span><span className="text-foreground">{allTotals.calls.toLocaleString()}</span></span>
                                <span title="Share of input tokens served from Gemini's cache, at the cached price"><span className="text-foreground-muted">Cached input </span><span className="text-foreground">{cacheShare(allTotals)}</span></span>
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full text-sm">
                                    <thead className="bg-background-tertiary text-xs text-foreground-muted">
                                        <tr>
                                            <th className="text-left font-medium px-3 py-2">Model · use</th>
                                            <th className="text-right font-medium px-3 py-2">Calls</th>
                                            <th className="text-right font-medium px-3 py-2">Input</th>
                                            <th className="text-right font-medium px-3 py-2">Cached</th>
                                            <th className="text-right font-medium px-3 py-2">Output</th>
                                            <th className="text-right font-medium px-3 py-2">Est. cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map(r => {
                                            const kinds = USAGE_KINDS.filter(k => r.kinds[k]?.calls);
                                            const total = sumTotals(kinds.map(k => r.kinds[k]));
                                            return (
                                                <React.Fragment key={r.model}>
                                                    <tr className="border-t border-border">
                                                        <td className="px-3 py-2 font-medium text-foreground">{r.model}</td>
                                                        <Cells t={total} priced={r.priced} strong />
                                                    </tr>
                                                    {kinds.length > 1 && kinds.map(k => (
                                                        <tr key={k} className="text-foreground-muted">
                                                            <td className="px-3 py-1.5 pl-6 text-xs">{USAGE_KIND_LABEL[k]}</td>
                                                            <Cells t={r.kinds[k]!} priced={r.priced} />
                                                        </tr>
                                                    ))}
                                                    {kinds.length === 1 && (
                                                        <tr className="text-foreground-muted">
                                                            <td className="px-3 pb-2 pl-6 text-xs" colSpan={6}>{USAGE_KIND_LABEL[kinds[0]]}</td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {peopleRows.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs uppercase tracking-wider text-foreground-subtle">By person</p>
                                    <div className="rounded-lg border border-border divide-y divide-border">
                                        {peopleRows.map(([uid, p]) => (
                                            <div key={uid} className="flex items-center gap-3 px-3 py-2 text-sm">
                                                <span className="flex-1 min-w-0 truncate text-foreground">{p.email ?? 'Unknown'}</span>
                                                <span className="text-foreground-muted">{p.calls.toLocaleString()} calls</span>
                                                <span className="w-16 text-right text-foreground">{money(p.costMicros)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function Cells({ t, priced, strong = false }: { t: UsageTotals; priced: boolean; strong?: boolean }) {
    const cls = `px-3 py-1.5 text-right tabular-nums ${strong ? 'text-foreground' : 'text-xs'}`;
    return (
        <>
            <td className={cls}>{t.calls.toLocaleString()}</td>
            <td className={cls}>{compact.format(t.inputTokens)}</td>
            <td className={cls}>{cacheShare(t)}</td>
            <td className={cls}>{compact.format(t.outputTokens)}</td>
            <td className={cls} title={priced ? undefined : 'No price on file for this model'}>{priced ? money(t.costMicros) : '–'}</td>
        </>
    );
}
