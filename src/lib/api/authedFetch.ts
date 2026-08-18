'use client';

import { auth } from '@/lib/firebase/config';

/**
 * fetch() wrapper that attaches the current user's Firebase ID token as a
 * Bearer header. All calls to our internal /api routes must go through this —
 * the routes reject unauthenticated requests.
 */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const user = auth.currentUser;
    if (user) {
        // getIdToken() returns the cached token and silently refreshes when stale
        headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
    }
    return fetch(input, { ...init, headers });
}
