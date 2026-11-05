'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlobalPromptSettings, DEFAULT_GLOBAL_SETTINGS } from '@/types';
import { getGlobalSettings, updateGlobalSettings } from '@/lib/firebase';
import { useAuth } from '@/components/AuthContext';

/**
 * Hook to load and manage global prompt settings.
 * Settings are shared across all campaigns in the workspace.
 *
 * The read waits for the signed-in user: Firebase restores sign-in
 * asynchronously, and `settings/global` is only readable by team members, so
 * a read at mount was denied and never retried (the copywriter then wrote
 * with no brand voice, personas or kill list).
 */
export function useGlobalSettings() {
    const { user, loading: authLoading } = useAuth();
    const uid = user?.uid ?? null;
    const [settings, setSettings] = useState<GlobalPromptSettings>(DEFAULT_GLOBAL_SETTINGS);
    const [loadedFor, setLoadedFor] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Signed out, or someone else signed in: drop the last person's settings
    // (state adjustment during render, not an effect)
    const [prevUid, setPrevUid] = useState(uid);
    if (uid !== prevUid) {
        setPrevUid(uid);
        setSettings(DEFAULT_GLOBAL_SETTINGS);
        setError(null);
    }

    // Load once per signed-in user
    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        getGlobalSettings().then(
            loaded => {
                if (cancelled) return;
                setSettings(loaded);
                setLoadedFor(uid);
            },
            err => {
                if (cancelled) return;
                console.error('Failed to load global settings:', err);
                setError(err instanceof Error ? err : new Error('Failed to load settings'));
                setLoadedFor(uid);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [uid]);

    const loading = authLoading || (!!uid && loadedFor !== uid);

    // Update settings (persists to Firestore)
    const update = useCallback(async (updates: Partial<GlobalPromptSettings>) => {
        setIsSaving(true);
        try {
            await updateGlobalSettings(updates);
            setSettings(prev => ({ ...prev, ...updates }));
        } catch (err) {
            console.error('Failed to update global settings:', err);
            throw err;
        } finally {
            setIsSaving(false);
        }
    }, []);

    // Re-read the team's settings (e.g. when Settings opens), so a save from
    // a tab opened hours ago doesn't overwrite a teammate's newer changes.
    const reload = useCallback(async () => {
        try {
            setSettings(await getGlobalSettings());
        } catch (err) {
            console.error('Failed to reload global settings:', err);
        }
    }, []);

    return {
        settings,
        loading,
        error,
        isSaving,
        update,
        reload,
    };
}
