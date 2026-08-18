'use client';

import { useState, useEffect, useCallback } from 'react';
import { authedFetch } from '@/lib/api/authedFetch';
import { useAuth } from '@/components/AuthContext';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MetaConnection, MetaTopPerformer, MetaDatePreset } from '@/lib/meta/types';
import { consumeMetaCallback } from '@/lib/meta/callbackParams';

interface UseMetaConnectionReturn {
    connection: MetaConnection | null;
    loading: boolean;
    error: string | null;
    isConnected: boolean;
    selectedAdAccountId: string | null;
    // Actions
    fetchTopPerformers: (options?: FetchTopPerformersOptions) => Promise<MetaTopPerformer[]>;
    updateSelectedAdAccount: (adAccountId: string) => Promise<void>;
}

interface FetchTopPerformersOptions {
    datePreset?: MetaDatePreset;
    limit?: number;
}

/**
 * Hook for accessing Meta connection and making API calls
 */
export function useMetaConnection(): UseMetaConnectionReturn {
    const { user } = useAuth();
    const [connection, setConnection] = useState<MetaConnection | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Subscribe to connection changes. The signed-out case is handled by
    // deriving the returned values below instead of setting state in the
    // effect (avoids a cascading render).
    useEffect(() => {
        if (!user) return;

        const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');

        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                // Handle Firestore Timestamp or string dates
                let expiresAt: Date;
                if (data.tokenExpiresAt?.toDate) {
                    expiresAt = data.tokenExpiresAt.toDate();
                } else if (typeof data.tokenExpiresAt === 'string') {
                    expiresAt = new Date(data.tokenExpiresAt);
                } else {
                    expiresAt = new Date(data.tokenExpiresAt);
                }

                // Check if token is still valid
                if (expiresAt > new Date()) {
                    const connectionData: MetaConnection = {
                        ...data,
                        tokenExpiresAt: expiresAt,
                        connectedAt: data.connectedAt?.toDate?.() || new Date(data.connectedAt),
                    } as MetaConnection;
                    setConnection(connectionData);
                    setError(null);
                } else {
                    console.warn('[MetaConnection] Token expired:', expiresAt.toISOString());
                    setConnection(null);
                    setError('Meta connection expired. Please reconnect.');
                }
            } else {
                console.log('[MetaConnection] No connection document found for user:', user.uid);
                setConnection(null);
            }
            setLoading(false);
        }, (err) => {
            console.error('[MetaConnection] Firestore subscription error:', err);
            setError('Failed to load Meta connection');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Handle OAuth callback from URL (after redirect from Meta)
    useEffect(() => {
        async function handleOAuthCallback() {
            if (!user) return;

            const result = consumeMetaCallback();
            if (!result) return;

            if (result.error) {
                setError(result.error);
                return;
            }

            if (result.connection) {
                try {
                    // Store in Firestore (onSnapshot will pick this up)
                    const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
                    await setDoc(docRef, result.connection);
                    setError(null);
                } catch (err) {
                    console.error('Failed to save Meta connection:', err);
                    setError('Failed to save connection data');
                }
            }
        }

        handleOAuthCallback();
    }, [user]);

    // Fetch top performing ads
    const fetchTopPerformers = useCallback(async (
        options: FetchTopPerformersOptions = {}
    ): Promise<MetaTopPerformer[]> => {
        if (!connection) {
            throw new Error('Meta not connected');
        }

        if (!connection.selectedAdAccountId) {
            throw new Error('No ad account selected');
        }

        const response = await authedFetch('/api/meta/top-performers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                adAccountId: connection.selectedAdAccountId,
                datePreset: options.datePreset || 'last_90d',
                limit: options.limit || 50,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            if (data.code === 'TOKEN_EXPIRED') {
                setError('Meta connection expired. Please reconnect.');
            }
            throw new Error(data.error || 'Failed to fetch top performers');
        }

        return data.data as MetaTopPerformer[];
    }, [connection]);

    // Update selected ad account
    const updateSelectedAdAccount = useCallback(async (adAccountId: string) => {
        if (!user || !connection) return;

        const updatedConnection = {
            ...connection,
            selectedAdAccountId: adAccountId,
        };

        const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
        await setDoc(docRef, updatedConnection);
    }, [user, connection]);

    // Signed out: expose no connection and don't report loading, regardless
    // of any stale subscription state left from a previous session
    const effectiveConnection = user ? connection : null;

    return {
        connection: effectiveConnection,
        loading: user ? loading : false,
        error,
        isConnected: !!effectiveConnection,
        selectedAdAccountId: effectiveConnection?.selectedAdAccountId || null,
        fetchTopPerformers,
        updateSelectedAdAccount,
    };
}
