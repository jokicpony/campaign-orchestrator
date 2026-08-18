'use client';

import { MetaConnection } from './types';

/**
 * Shared consumer for the Meta OAuth callback redirect.
 *
 * The callback route redirects to `/?meta_connected=true#meta_data=<json>`
 * (or `/?meta_error=<msg>`). The token payload travels in the URL fragment so
 * it never reaches server logs or Referer headers. This helper parses both,
 * scrubs the URL, and memoizes the result so the multiple components that
 * watch for the callback (useMetaConnection, MetaConnect, ConnectionsSettings)
 * all see the same data instead of each re-parsing the URL.
 */

export interface MetaCallbackResult {
    connection?: MetaConnection;
    error?: string;
}

let consumed: MetaCallbackResult | null = null;

export function consumeMetaCallback(): MetaCallbackResult | null {
    if (typeof window === 'undefined') return null;
    if (consumed) return consumed;

    const params = new URLSearchParams(window.location.search);
    const metaConnected = params.get('meta_connected');
    const metaError = params.get('meta_error');

    if (!metaConnected && !metaError) return null;

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const metaData = hashParams.get('meta_data'); // URLSearchParams already URL-decodes

    // Scrub query and fragment so the payload doesn't linger in the URL bar
    // or session history
    window.history.replaceState({}, '', window.location.pathname);

    if (metaError) {
        consumed = { error: metaError };
        return consumed;
    }

    if (metaConnected && metaData) {
        try {
            const connection = JSON.parse(metaData) as MetaConnection;
            connection.tokenExpiresAt = new Date(connection.tokenExpiresAt);
            connection.connectedAt = new Date(connection.connectedAt);
            consumed = { connection };
        } catch {
            consumed = { error: 'Failed to parse connection data' };
        }
        return consumed;
    }

    return null;
}
