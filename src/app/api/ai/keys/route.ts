import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { getProviderKeys, setProviderKey, deleteProviderKey } from '@/lib/server/providerKeyStore';
import { logger, serializeError } from '@/lib/logger';
import type { AIProvider } from '@/types';

/**
 * Manage the signed-in user's own AI provider API keys.
 *
 * Keys are stored server-side (owner-only, see providerKeyStore) — they are never
 * returned by GET (only booleans), never written to a client-readable doc, and
 * apply server-side on that user's own generation requests, falling back to the
 * server env vars when unset.
 */

const PROVIDERS: AIProvider[] = ['google', 'anthropic', 'openai'];
const ENV_VAR: Record<AIProvider, string> = {
    google: 'GEMINI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
};

function isProvider(p: unknown): p is AIProvider {
    return typeof p === 'string' && (PROVIDERS as string[]).includes(p);
}

// GET → per-provider status (never the key value): does this user have their own
// key, and/or is there a server env fallback?
export async function GET(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;
    try {
        const keys = await getProviderKeys(authed.uid);
        const providers = Object.fromEntries(
            PROVIDERS.map(p => [p, { userKey: !!keys[p], envKey: !!process.env[ENV_VAR[p]] }])
        );
        return NextResponse.json({ providers });
    } catch (error) {
        logger.error('ai-keys', 'Status read failed', { error: serializeError(error) });
        return NextResponse.json({ error: 'Failed to read key status' }, { status: 503 });
    }
}

// POST { provider, key } → store this user's key.
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;
    try {
        const { provider, key } = await request.json();
        if (!isProvider(provider) || typeof key !== 'string' || key.trim().length < 8) {
            return NextResponse.json({ error: 'A valid provider and API key are required' }, { status: 400 });
        }
        await setProviderKey(authed.uid, provider, key.trim());
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('ai-keys', 'Save failed', { error: serializeError(error) });
        return NextResponse.json({ error: 'Failed to save key' }, { status: 503 });
    }
}

// DELETE { provider } → clear this user's key for a provider.
export async function DELETE(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;
    try {
        const { provider } = await request.json();
        if (!isProvider(provider)) {
            return NextResponse.json({ error: 'A valid provider is required' }, { status: 400 });
        }
        await deleteProviderKey(authed.uid, provider);
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('ai-keys', 'Delete failed', { error: serializeError(error) });
        return NextResponse.json({ error: 'Failed to delete key' }, { status: 503 });
    }
}
