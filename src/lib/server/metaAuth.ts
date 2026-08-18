import { NextResponse } from 'next/server';
import { getMetaToken } from './metaTokenStore';
import { logger, serializeError } from '@/lib/logger';

/**
 * Route guard: resolve the caller's Meta access token from the server-only
 * store, or return a response the handler can return directly.
 *
 *   const accessToken = await requireMetaToken(authed.uid);
 *   if (accessToken instanceof NextResponse) return accessToken;
 *
 * Two distinct failure modes, so the client never sends a user into a pointless
 * reconnect loop over an infrastructure blip:
 *   - 401 TOKEN_EXPIRED           — no connection or it expired → reconnect.
 *   - 503 TOKEN_STORE_UNAVAILABLE — the token store / identity federation is
 *                                   temporarily unreachable → retry, don't reconnect.
 */
export async function requireMetaToken(uid: string): Promise<string | NextResponse> {
    let stored;
    try {
        stored = await getMetaToken(uid);
    } catch (error) {
        // Firestore / Workload Identity failure — NOT a token problem. Telling
        // the user to reconnect can't fix an outage, so surface it distinctly.
        logger.error('meta-auth', 'Failed to read the Meta token store', { error: serializeError(error) });
        return NextResponse.json(
            {
                error: 'Temporarily unable to reach the connection store. Please try again in a moment.',
                code: 'TOKEN_STORE_UNAVAILABLE',
            },
            { status: 503 }
        );
    }

    if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) {
        return NextResponse.json(
            {
                error: 'Meta is not connected, or the connection has expired — reconnect Meta',
                code: 'TOKEN_EXPIRED',
            },
            { status: 401 }
        );
    }

    return stored.accessToken;
}
