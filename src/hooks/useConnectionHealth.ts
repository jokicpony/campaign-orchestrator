'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface ConnectionHealth {
    google: 'connected' | 'needs_attention';
    meta: 'connected' | 'not_connected' | 'expired';
    ai: 'configured' | 'not_configured';
    hasIssues: boolean;
}

export function useConnectionHealth(): ConnectionHealth {
    const { user, driveAccessToken } = useAuth();
    const [health, setHealth] = useState<ConnectionHealth>({
        google: 'connected',
        meta: 'not_connected',
        ai: 'not_configured',
        hasIssues: true,
    });

    useEffect(() => {
        async function checkConnections() {
            if (!user) return;

            // Check Google/Drive status
            const googleStatus: 'connected' | 'needs_attention' = driveAccessToken
                ? 'connected'
                : 'needs_attention';

            // Check Meta status
            let metaStatus: 'connected' | 'not_connected' | 'expired' = 'not_connected';
            try {
                const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let expiresAt: Date;
                    if (data.tokenExpiresAt?.toDate) {
                        expiresAt = data.tokenExpiresAt.toDate();
                    } else {
                        expiresAt = new Date(data.tokenExpiresAt);
                    }

                    if (expiresAt > new Date()) {
                        metaStatus = 'connected';
                    } else {
                        metaStatus = 'expired';
                    }
                }
            } catch (err) {
                console.error('Failed to check Meta connection:', err);
            }

            // Check AI provider status via server API (env var check)
            let aiStatus: 'configured' | 'not_configured' = 'not_configured';
            try {
                const response = await fetch('/api/ai/generate');
                const data = await response.json();
                aiStatus = data.configured ? 'configured' : 'not_configured';
            } catch {
                aiStatus = 'not_configured';
            }

            // Determine if there are issues that need attention
            const hasIssues =
                googleStatus === 'needs_attention' ||
                metaStatus === 'expired' ||
                metaStatus === 'not_connected';

            setHealth({
                google: googleStatus,
                meta: metaStatus,
                ai: aiStatus,
                hasIssues,
            });
        }

        checkConnections();
    }, [user, driveAccessToken]);

    return health;
}
