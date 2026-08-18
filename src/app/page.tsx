'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Campaign, AdRow } from '@/types';
import { useAuth } from '@/components/AuthContext';
import { useCampaigns, useGlobalSettings } from '@/hooks';
import { useThumbnailResolver } from '@/hooks/useThumbnailResolver';
import { CampaignTabs } from '@/components/CampaignTabs';
import { BuildMode } from '@/components/BuildMode';
import { ReviewMode } from '@/components/ReviewMode';
import { SettingsModal } from '@/components/Settings';
import { LogIn, Loader2 } from 'lucide-react';

export default function Home() {
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const {
    campaigns,
    activeCampaign,
    activeCampaignId,
    loading: campaignsLoading,
    saving,
    error,
    isLocked,
    lockedBy,
    selectCampaign,
    addCampaign,
    closeCampaign,
    archiveCampaign,
    restoreCampaign,
    archivedCampaigns,
    renameCampaign,
    updateCampaign,
    reorderCampaigns,
  } = useCampaigns();

  // Global settings (shared across all campaigns)
  const { settings: globalSettings, update: updateGlobalSettings, loading: settingsLoading } = useGlobalSettings();

  const [mode, setMode] = useState<'build' | 'review'>('build');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Track pending updates for undo/redo (local session only)
  const [localCampaignState, setLocalCampaignState] = useState<Campaign | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Partial<Campaign>>({});

  // Sync local state when the campaign changes or data refreshes
  // (state adjustment during render instead of an effect, avoiding a
  // double render — see react.dev "adjusting state when a prop changes")
  const currentCampaign = activeCampaign ?? null;
  const [prevActiveCampaign, setPrevActiveCampaign] = useState<Campaign | null>(null);
  if (currentCampaign !== prevActiveCampaign) {
    setPrevActiveCampaign(currentCampaign);
    setLocalCampaignState(currentCampaign);
  }

  // Resolve permanent thumbnail URLs for row assets loaded from Firestore
  // This patches assets saved before the thumbnail cache existed
  useThumbnailResolver(localCampaignState, (updates) => {
    setLocalCampaignState(prev => prev ? { ...prev, ...updates } : prev);
    updateCampaign(updates);
  });

  // Debounced save to Firestore with update coalescing
  const debouncedSave = useCallback((updates: Partial<Campaign>) => {
    // Coalesce updates - merge new updates with any pending ones
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      // Save all coalesced updates at once
      updateCampaign(pendingUpdatesRef.current);
      pendingUpdatesRef.current = {}; // Clear pending updates after save
    }, 3000); // 3s debounce — allows heavy edit bursts to coalesce into one write
  }, [updateCampaign]);

  // Handle campaign updates with local state + debounced save
  const handleUpdateCampaign = useCallback((updates: Partial<Campaign>) => {
    // Update local state immediately for responsive UI
    // Use functional updater so rapid synchronous calls chain correctly
    // (e.g., accepting 3 items in a forEach won't overwrite each other)
    setLocalCampaignState(prev => {
      if (!prev) return prev;
      return { ...prev, ...updates, updatedAt: new Date() };
    });

    // Debounce save to Firestore (with coalescing)
    debouncedSave(updates);
  }, [debouncedSave]);

  const handleSelectCampaign = useCallback(async (id: string) => {
    // Cancel any in-flight debounced save for the OLD campaign
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    // Flush any pending updates to the old campaign before switching
    if (pendingUpdatesRef.current && Object.keys(pendingUpdatesRef.current).length > 0) {
      updateCampaign(pendingUpdatesRef.current);
    }
    pendingUpdatesRef.current = {};

    await selectCampaign(id);
  }, [selectCampaign, updateCampaign]);

  const handleAddCampaign = useCallback(async () => {
    await addCampaign();
  }, [addCampaign]);

  const handleCloseCampaign = useCallback(async (id: string) => {
    await closeCampaign(id);
  }, [closeCampaign]);

  const handleRenameCampaign = useCallback(async (id: string, newName: string) => {
    await renameCampaign(id, newName);
  }, [renameCampaign]);

  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Handle row updates for review mode (status, comments)
  // Uses functional state update to handle rapid consecutive calls correctly
  const handleUpdateRow = useCallback((rowId: string, updates: Partial<AdRow>) => {
    setLocalCampaignState(prevState => {
      if (!prevState) return prevState;

      const updatedRows = prevState.rows.map(row =>
        row.id === rowId ? { ...row, ...updates } : row
      );

      const newState = { ...prevState, rows: updatedRows, updatedAt: new Date() };

      // Debounce save to Firestore
      debouncedSave({ rows: updatedRows });

      return newState;
    });
  }, [debouncedSave]);

  // Show sign-in screen if not authenticated
  if (authLoading || settingsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-foreground-muted">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-6">
        <div className="text-center">
          <img
            src="/logo.png"
            alt="Campaign Orchestrator"
            className="w-24 h-24 rounded-2xl mx-auto mb-4 shadow-lg"
          />
          <h1 className="text-2xl font-bold mb-2">Campaign Orchestrator</h1>
          <p className="text-foreground-muted mb-6">The Headless CMS for Ad Production</p>
        </div>
        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white font-medium transition-colors shadow-lg"
        >
          <LogIn className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    );
  }

  // Show loading while campaigns load
  if (campaignsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-foreground-muted">Loading campaigns...</p>
      </div>
    );
  }

  // Use local state for display (more responsive), fall back to Firestore state
  const displayCampaign = localCampaignState || activeCampaign;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Lock banner */}
      {isLocked && lockedBy && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-amber-400 text-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          This campaign is being edited by {lockedBy}. You can view but not edit.
        </div>
      )}

      {/* Saving indicator is now integrated into CampaignTabs header */}

      {/* Campaign Tabs Header */}
      <CampaignTabs
        campaigns={campaigns}
        activeCampaignId={activeCampaignId || ''}
        onSelectCampaign={handleSelectCampaign}
        onAddCampaign={handleAddCampaign}
        onCloseCampaign={handleCloseCampaign}
        onArchiveCampaign={archiveCampaign}
        onRenameCampaign={handleRenameCampaign}
        onReorderCampaigns={reorderCampaigns}
        mode={mode}
        onToggleMode={() => setMode(mode === 'build' ? 'review' : 'build')}
        onOpenSettings={handleOpenSettings}
        saving={saving}
      // TODO: Re-add undo/redo with local state tracking if needed
      />

      {/* Main Content */}
      <main className={`flex-1 ${mode === 'review' ? 'overflow-auto' : 'overflow-hidden'}`}>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-foreground-muted">No campaigns yet</p>
            <button
              onClick={handleAddCampaign}
              className="px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white font-medium transition-colors"
            >
              Create Your First Campaign
            </button>
          </div>
        ) : mode === 'build' && displayCampaign ? (
          <BuildMode
            key={displayCampaign.id}
            campaign={displayCampaign}
            onUpdateCampaign={handleUpdateCampaign}
            globalSettings={globalSettings}
            onUpdateGlobalSettings={updateGlobalSettings}
          />
        ) : mode === 'review' && displayCampaign ? (
          <ReviewMode
            key={displayCampaign.id}
            campaign={displayCampaign}
            onUpdateRow={handleUpdateRow}
            globalSettings={globalSettings}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-foreground-muted">
            Select a campaign
          </div>
        )}
      </main>
      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={globalSettings}
        onSave={async (settings) => {
          await updateGlobalSettings(settings);
        }}
        archivedCampaigns={archivedCampaigns}
        onRestoreCampaign={restoreCampaign}
        onDeleteCampaign={closeCampaign}
        savingCampaigns={saving}
      />
    </div>
  );
}
