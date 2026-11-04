import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { readAiUsage } from '@/lib/server/aiUsage';
import { logger, serializeError } from '@/lib/logger';
import { dayKey, hasPrice, USAGE_WINDOW_DAYS, windowStart } from '@/lib/ai/usage';

/**
 * GET → the last 30 days of AI usage (UTC days), per model, kind and person,
 * with estimated cost (Settings → Usage sums 7 or 30 days). Team members only.
 */
export async function GET(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    const today = dayKey(new Date());
    try {
        const usage = (await readAiUsage(windowStart(today, USAGE_WINDOW_DAYS))).map(u => ({ ...u, priced: hasPrice(u.model) }));
        return NextResponse.json({ today, usage });
    } catch (err) {
        logger.error('ai', 'Usage read failed', { uid: authed.uid, error: serializeError(err) });
        return NextResponse.json({ error: "Couldn't read usage right now.", code: 'USAGE_UNAVAILABLE' }, { status: 503 });
    }
}
