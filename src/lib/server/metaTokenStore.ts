import { FieldValue } from '@google-cloud/firestore';
import { getServerFirestore } from './gcpFirestore';

/**
 * Server-only store for the Meta long-lived access token, keyed by Firebase uid.
 *
 * The token lives ONLY here — never in the browser, never in a client-readable
 * Firestore doc, never in an API request body. Routes look it up by the verified
 * uid from the caller's Firebase ID token (see verifyAuth). The `serverSecrets`
 * collection is denied to all clients in firestore.rules; only this backend
 * (via Workload Identity) can touch it.
 */

const COLLECTION = 'serverSecrets';

export interface StoredMetaToken {
    accessToken: string;
    expiresAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
}

export async function setMetaToken(
    uid: string,
    accessToken: string,
    expiresAt: string
): Promise<void> {
    const db = getServerFirestore();
    await db.collection(COLLECTION).doc(uid).set(
        {
            meta: {
                accessToken,
                expiresAt,
                updatedAt: new Date().toISOString(),
            } satisfies StoredMetaToken,
        },
        { merge: true }
    );
}

export async function getMetaToken(uid: string): Promise<StoredMetaToken | null> {
    const db = getServerFirestore();
    const snap = await db.collection(COLLECTION).doc(uid).get();
    if (!snap.exists) return null;
    const meta = snap.get('meta') as StoredMetaToken | undefined;
    return meta ?? null;
}

export async function deleteMetaToken(uid: string): Promise<void> {
    const db = getServerFirestore();
    // Delete just the field so the doc can hold other server secrets later.
    await db.collection(COLLECTION).doc(uid).set(
        { meta: FieldValue.delete() },
        { merge: true }
    );
}
