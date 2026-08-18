'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/AuthContext';
import {
    listAllCampaigns,
    createCampaign,
    updateCampaign as updateCampaignInFirestore,
    deleteCampaign as deleteCampaignInFirestore,
    acquireLock,
    releaseLock,
    refreshLock,
} from '@/lib/firebase';
import { Campaign } from '@/types';

// ============================================
// Types
// ============================================

interface UseCampaignsReturn {
    // Data
    campaigns: Campaign[];          // Active campaigns only
    archivedCampaigns: Campaign[];  // Archived campaigns
    activeCampaign: Campaign | null;
    activeCampaignId: string | null;

    // Loading states
    loading: boolean;
    saving: boolean;
    error: string | null;

    // Lock state
    isLocked: boolean;
    lockedBy: string | null;

    // Actions
    selectCampaign: (id: string) => Promise<void>;
    addCampaign: (name?: string) => Promise<Campaign | null>;
    closeCampaign: (id: string) => Promise<void>;
    archiveCampaign: (id: string) => Promise<void>;
    restoreCampaign: (id: string) => Promise<void>;
    renameCampaign: (id: string, newName: string) => Promise<void>;
    updateCampaign: (updates: Partial<Campaign>) => Promise<void>;
    reorderCampaigns: (reorderedCampaigns: Campaign[]) => Promise<void>;

    // Refresh
    refreshCampaigns: () => Promise<void>;
}

// ============================================
// Hook
// ============================================

export function useCampaigns(): UseCampaignsReturn {
    const { user } = useAuth();

    // State
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const [lockedBy, setLockedBy] = useState<string | null>(null);

    // Refs for lock refresh interval
    const lockRefreshInterval = useRef<NodeJS.Timeout | null>(null);

    // Save queue refs — prevents overlapping Firestore writes
    const saveInProgressRef = useRef(false);
    const pendingQueueRef = useRef<Partial<Campaign>>({});

    // Get active campaign (only non-archived)
    const activeCampaigns = campaigns.filter(c => c.archiveStatus !== 'archived');
    const archivedCampaigns = campaigns.filter(c => c.archiveStatus === 'archived');
    const activeCampaign = activeCampaigns.find(c => c.id === activeCampaignId) || null;

    // ============================================
    // Load Campaigns
    // ============================================

    const refreshCampaigns = useCallback(async () => {
        if (!user) {
            setCampaigns([]);
            setLoading(false);
            return;
        }

        try {
            setError(null);
            const loadedCampaigns = await listAllCampaigns();
            setCampaigns(loadedCampaigns);

            // If no active campaign, select the first one (or none if empty)
            if (!activeCampaignId && loadedCampaigns.length > 0) {
                setActiveCampaignId(loadedCampaigns[0].id);
            } else if (activeCampaignId && !loadedCampaigns.find(c => c.id === activeCampaignId)) {
                // Active campaign was deleted, switch to first
                setActiveCampaignId(loadedCampaigns.length > 0 ? loadedCampaigns[0].id : null);
            }
        } catch (err) {
            console.error('Failed to load campaigns:', err);
            setError('Failed to load campaigns');
        } finally {
            setLoading(false);
        }
    }, [user, activeCampaignId]);

    // Load on mount and when user changes
    useEffect(() => {
        refreshCampaigns();
    }, [user]);

    // Auto-dismiss error messages after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // ============================================
    // Lock Management
    // ============================================

    const tryAcquireLock = useCallback(async (campaignId: string) => {
        if (!user) return false;

        const result = await acquireLock(campaignId, user.uid, user.displayName || undefined);
        if (result.success) {
            setIsLocked(false);
            setLockedBy(null);

            // Start refresh interval (every 2 minutes)
            if (lockRefreshInterval.current) {
                clearInterval(lockRefreshInterval.current);
            }
            lockRefreshInterval.current = setInterval(async () => {
                await refreshLock(campaignId, user.uid);
            }, 2 * 60 * 1000);

            return true;
        } else {
            setIsLocked(true);
            // Prefer display name, fallback to userId, then generic message
            setLockedBy(result.lockedByName || result.lockedBy || 'Another user');
            return false;
        }
    }, [user]);

    const releaseCurrentLock = useCallback(async () => {
        if (lockRefreshInterval.current) {
            clearInterval(lockRefreshInterval.current);
            lockRefreshInterval.current = null;
        }
        if (activeCampaignId) {
            await releaseLock(activeCampaignId);
        }
        setIsLocked(false);
        setLockedBy(null);
    }, [activeCampaignId]);

    // Release lock on unmount
    useEffect(() => {
        return () => {
            if (lockRefreshInterval.current) {
                clearInterval(lockRefreshInterval.current);
            }
            // Note: Can't await in cleanup, but the lock will expire anyway
        };
    }, []);

    // ============================================
    // Campaign Actions
    // ============================================

    const selectCampaign = useCallback(async (id: string) => {
        // Release current lock
        await releaseCurrentLock();

        // Set new active campaign
        setActiveCampaignId(id);

        // Try to acquire lock on new campaign
        await tryAcquireLock(id);
    }, [releaseCurrentLock, tryAcquireLock]);

    const addCampaign = useCallback(async (name?: string): Promise<Campaign | null> => {
        if (!user) {
            setError('Must be signed in to create campaigns');
            return null;
        }

        try {
            setSaving(true);
            setError(null);

            const campaignName = name || `Campaign ${campaigns.length + 1}`;
            const newCampaign = await createCampaign(user.uid, campaignName);

            // Add to local state
            setCampaigns(prev => [newCampaign, ...prev]);
            setActiveCampaignId(newCampaign.id);

            // Acquire lock
            await tryAcquireLock(newCampaign.id);

            return newCampaign;
        } catch (err) {
            console.error('Failed to create campaign:', err);
            setError('Failed to create campaign');
            return null;
        } finally {
            setSaving(false);
        }
    }, [user, campaigns.length, tryAcquireLock]);

    const closeCampaign = useCallback(async (id: string) => {
        if (campaigns.length <= 1) return;

        try {
            setSaving(true);

            // If closing active campaign, release lock and switch
            if (id === activeCampaignId) {
                await releaseCurrentLock();
                const remaining = campaigns.filter(c => c.id !== id);
                setActiveCampaignId(remaining[0]?.id || null);
                if (remaining[0]) {
                    await tryAcquireLock(remaining[0].id);
                }
            }

            // Delete from Firestore
            await deleteCampaignInFirestore(id);

            // Update local state
            setCampaigns(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error('Failed to delete campaign:', err);
            setError('Failed to delete campaign');
        } finally {
            setSaving(false);
        }
    }, [campaigns, activeCampaignId, releaseCurrentLock, tryAcquireLock]);

    const renameCampaign = useCallback(async (id: string, newName: string) => {
        try {
            setSaving(true);
            await updateCampaignInFirestore(id, { name: newName });

            // Update local state
            setCampaigns(prev =>
                prev.map(c => (c.id === id ? { ...c, name: newName } : c))
            );
        } catch (err) {
            console.error('Failed to rename campaign:', err);
            setError('Failed to rename campaign');
        } finally {
            setSaving(false);
        }
    }, []);

    const updateCampaign = useCallback(async (updates: Partial<Campaign>) => {
        if (!activeCampaignId) return;
        if (isLocked) {
            setError('Campaign is locked by another user');
            return;
        }

        // Merge new updates into the pending queue
        pendingQueueRef.current = { ...pendingQueueRef.current, ...updates };

        // If a save is already in flight, the queued updates
        // will be flushed when it completes — don't start another write
        if (saveInProgressRef.current) return;

        // Drain the queue: process batches sequentially until empty
        while (Object.keys(pendingQueueRef.current).length > 0) {
            saveInProgressRef.current = true;
            const batch = pendingQueueRef.current;
            pendingQueueRef.current = {};

            try {
                setSaving(true);

                // Write to Firestore
                await updateCampaignInFirestore(activeCampaignId, batch);

                // Update local state
                setCampaigns(prev =>
                    prev.map(c =>
                        c.id === activeCampaignId
                            ? { ...c, ...batch, updatedAt: new Date() }
                            : c
                    )
                );
            } catch (err) {
                // Re-queue failed updates so they aren't lost
                pendingQueueRef.current = { ...batch, ...pendingQueueRef.current };
                console.error('Failed to update campaign:', err);
                setError('Save failed — retrying on next change');
                // Break out to avoid infinite retry loop;
                // the next user edit will trigger a retry
                break;
            } finally {
                saveInProgressRef.current = false;
                setSaving(Object.keys(pendingQueueRef.current).length > 0);
            }
        }
    }, [activeCampaignId, isLocked]);

    // Reorder campaigns (for drag-and-drop tabs)
    const reorderCampaigns = useCallback(async (reorderedCampaigns: Campaign[]) => {
        // Update local state immediately for smooth UX
        setCampaigns(reorderedCampaigns);

        // Persist order to Firestore by setting position field
        try {
            await Promise.all(
                reorderedCampaigns.map((campaign, index) =>
                    updateCampaignInFirestore(campaign.id, { position: index })
                )
            );
        } catch (err) {
            console.error('Failed to persist campaign order:', err);
            // Don't set error - order is still correct locally
        }
    }, []);

    // Archive a campaign
    const archiveCampaign = useCallback(async (id: string) => {
        try {
            setSaving(true);

            // If archiving active campaign, release lock and switch to another
            if (id === activeCampaignId) {
                await releaseCurrentLock();
                const remaining = activeCampaigns.filter(c => c.id !== id);
                setActiveCampaignId(remaining[0]?.id || null);
                if (remaining[0]) {
                    await tryAcquireLock(remaining[0].id);
                }
            }

            // Update in Firestore
            await updateCampaignInFirestore(id, {
                archiveStatus: 'archived',
                archivedAt: new Date().toISOString(),
            });

            // Update local state
            setCampaigns(prev =>
                prev.map(c =>
                    c.id === id
                        ? { ...c, archiveStatus: 'archived' as const, archivedAt: new Date().toISOString() }
                        : c
                )
            );
        } catch (err) {
            console.error('Failed to archive campaign:', err);
            setError('Failed to archive campaign');
        } finally {
            setSaving(false);
        }
    }, [activeCampaignId, activeCampaigns, releaseCurrentLock, tryAcquireLock]);

    // Restore an archived campaign
    const restoreCampaign = useCallback(async (id: string) => {
        try {
            setSaving(true);

            // Update in Firestore (use deleteField pattern by omitting archivedAt)
            await updateCampaignInFirestore(id, {
                archiveStatus: 'active',
            });

            // Update local state
            setCampaigns(prev =>
                prev.map(c =>
                    c.id === id
                        ? { ...c, archiveStatus: 'active' as const, archivedAt: undefined }
                        : c
                )
            );
        } catch (err) {
            console.error('Failed to restore campaign:', err);
            setError('Failed to restore campaign');
        } finally {
            setSaving(false);
        }
    }, []);

    return {
        campaigns: activeCampaigns,
        archivedCampaigns,
        activeCampaign,
        activeCampaignId,
        loading,
        saving,
        error,
        isLocked,
        lockedBy,
        selectCampaign,
        addCampaign,
        closeCampaign,
        archiveCampaign,
        restoreCampaign,
        renameCampaign,
        updateCampaign,
        reorderCampaigns,
        refreshCampaigns,
    };
}
