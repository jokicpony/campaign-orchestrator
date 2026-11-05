import { FieldValue } from '@google-cloud/firestore';
import { getServerFirestore } from './gcpFirestore';
import { logger, serializeError } from '@/lib/logger';
import { costMicros, dayKey, usageDocId, type UsageDay, type UsageKind } from '@/lib/ai/usage';

/**
 * Daily AI usage totals, one document per model per UTC day in `aiUsage`
 * (server-only: firestore.rules denies every client; this IAM client bypasses
 * the rules). Totals only, for the whole team and per person (uid → email,
 * calls, cost): no copy text, no per-request rows.
 */
const COLLECTION = 'aiUsage';
/** Recording never holds a request up for long, and never fails it. */
const RECORD_TIMEOUT_MS = 3000;

export async function recordAiUsage(entry: {
    uid: string;
    email?: string;
    model: string;
    kind: UsageKind;
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
}): Promise<void> {
    const inputTokens = entry.inputTokens ?? 0;
    const outputTokens = entry.outputTokens ?? 0;
    if (inputTokens === 0 && outputTokens === 0) return;
    const cachedTokens = entry.cachedTokens ?? 0;
    const now = new Date();
    const day = dayKey(now);
    const cost = costMicros(entry.model, day, { inputTokens, cachedTokens, outputTokens });
    try {
        const write = getServerFirestore().collection(COLLECTION).doc(usageDocId(day, entry.model)).set({
            day,
            model: entry.model,
            updatedAt: now,
            kinds: {
                [entry.kind]: {
                    calls: FieldValue.increment(1),
                    inputTokens: FieldValue.increment(inputTokens),
                    cachedTokens: FieldValue.increment(cachedTokens),
                    outputTokens: FieldValue.increment(outputTokens),
                    costMicros: FieldValue.increment(cost),
                },
            },
            people: {
                [entry.uid]: {
                    ...(entry.email ? { email: entry.email } : {}),
                    calls: FieldValue.increment(1),
                    costMicros: FieldValue.increment(cost),
                },
            },
        }, { merge: true });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timed out')), RECORD_TIMEOUT_MS); });
        await Promise.race([write, timeout]).finally(() => clearTimeout(timer));
    } catch (err) {
        logger.warn('ai', 'Usage not recorded', { uid: entry.uid, model: entry.model, kind: entry.kind, error: serializeError(err) });
    }
}

/** Every model's daily totals from `fromDay` (YYYY-MM-DD) on. */
export async function readAiUsage(fromDay: string): Promise<UsageDay[]> {
    const snap = await getServerFirestore().collection(COLLECTION).where('day', '>=', fromDay).get();
    return snap.docs.map(doc => {
        const d = doc.data() as { day: string; model: string; kinds?: UsageDay['kinds']; people?: UsageDay['people'] };
        return { day: d.day, model: d.model, priced: false, kinds: d.kinds ?? {}, people: d.people ?? {} };
    });
}
