'use client';

import { authedFetch } from '@/lib/api/authedFetch';

/**
 * Start Meta OAuth from the client.
 *
 * The initiator route (/api/auth/meta) is an authenticated POST — it binds the
 * flow to the signed-in user so the callback can store the resulting token
 * server-side under that uid. This helper makes that authenticated call, then
 * hands the top-level window to the returned Facebook dialog URL.
 *
 * Throws if the start call fails (e.g. not signed in); callers should surface
 * the message. Every "Connect / Reconnect Meta" button must go through here —
 * a bare `window.location = '/api/auth/meta'` now hits a POST-only route (405).
 */
export async function startMetaOAuth(): Promise<void> {
    const res = await authedFetch('/api/auth/meta', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.authUrl) {
        throw new Error(data.error || 'Failed to start Meta sign-in');
    }
    window.location.href = data.authUrl;
}
