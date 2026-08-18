'use client';

import { useState, useEffect, useCallback } from 'react';
import { GlobalPromptSettings, DEFAULT_GLOBAL_SETTINGS } from '@/types';
import { getGlobalSettings, updateGlobalSettings } from '@/lib/firebase';

/**
 * Hook to load and manage global prompt settings.
 * Settings are shared across all campaigns in the workspace.
 */
export function useGlobalSettings() {
    const [settings, setSettings] = useState<GlobalPromptSettings>(DEFAULT_GLOBAL_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Load settings on mount
    useEffect(() => {
        let cancelled = false;

        async function loadSettings() {
            try {
                const loaded = await getGlobalSettings();
                if (!cancelled) {
                    setSettings(loaded);
                    setLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load global settings:', err);
                    setError(err instanceof Error ? err : new Error('Failed to load settings'));
                    setLoading(false);
                }
            }
        }

        loadSettings();

        return () => {
            cancelled = true;
        };
    }, []);

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

    return {
        settings,
        loading,
        error,
        isSaving,
        update,
    };
}
