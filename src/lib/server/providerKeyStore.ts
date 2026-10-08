import { FieldValue } from '@google-cloud/firestore';
import { getServerFirestore } from './gcpFirestore';
import type { AIProvider } from '@/types';

/**
 * Per-user AI provider API keys, stored server-side only.
 *
 * Keys live in the same server-only `serverSecrets/{uid}` doc as the Meta token
 * (denied to all clients by firestore.rules; reachable only by the backend via
 * Workload Identity). Each user's keys are private to them — a teammate can't
 * read them, and they never reach any browser. Routes look them up by the
 * verified uid and fall back to server env vars. See docs/ARCHITECTURE.md.
 */

const COLLECTION = 'serverSecrets';

export type ProviderKeys = Partial<Record<AIProvider, string>>;

export async function getProviderKeys(uid: string): Promise<ProviderKeys> {
    const db = getServerFirestore();
    const snap = await db.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) return {};
    return (snap.get('providerKeys') as ProviderKeys | undefined) ?? {};
}

export async function setProviderKey(uid: string, provider: AIProvider, key: string): Promise<void> {
    const db = getServerFirestore();
    // merge:true deep-merges the nested map, so other providers' keys are kept.
    await db.collection(COLLECTION).doc(uid).set(
        { providerKeys: { [provider]: key } },
        { merge: true }
    );
}

export async function deleteProviderKey(uid: string, provider: AIProvider): Promise<void> {
    const db = getServerFirestore();
    await db.collection(COLLECTION).doc(uid).set(
        { providerKeys: { [provider]: FieldValue.delete() } },
        { merge: true }
    );
}
