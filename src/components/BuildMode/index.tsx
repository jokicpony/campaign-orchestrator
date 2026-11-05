'use client';

import React, { useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Campaign, AdRow, CopyItem, AdRowSlots, SlotItem, Asset, GlobalPromptSettings, CampaignBrief, normalizeHeadlineSlots } from '@/types';
import { DndProvider } from '@/lib/dnd';
import { CopywriterPanel, type CopywriterHandle } from './Copywriter';
import { CampaignContextButton, CampaignContextPanel } from './CampaignContext';
import { Palette, type CopyView, type PaletteTab } from './Palette';
import type { CopyTarget, UseCopyResult } from './CopyTarget';
import { AssemblyLine } from './AssemblyLine';
import { AssetLibrary } from './AssetLibrary';
import { AdNamer } from './AdNamer';
import { FolderOpen, Settings2, Tag } from 'lucide-react';
import { useMetaConnection } from '@/hooks';
import { useAuth } from '@/components/AuthContext';
import { loadFolderAssets } from '@/lib/google';
import { findSlotFor, rowLabel } from '@/lib/ai/rowContext';
import { countPhrase, pickTopCopy } from '@/lib/ai/prompts';
import { aggregateTopCopy } from '@/lib/meta/topCopy';
import { copyUsage } from '@/lib/activePalette';

// Default brief for legacy campaigns that don't have the brief property
const DEFAULT_BRIEF: CampaignBrief = {
    keyMessages: '',
    driveFolderUrl: null,
};


interface BuildModeProps {
    campaign: Campaign;
    onUpdateCampaign: (updates: Partial<Campaign>, actionDescription?: string) => void;
    globalSettings: GlobalPromptSettings;
    /** Other campaigns, for "Copy context from campaign" */
    otherCampaigns: { id: string; name: string; brief?: CampaignBrief }[];
}

type TabId = 'assets' | 'assembly' | 'namer';

// Split-screen palette is a per-browser preference
const WIDE_PALETTE_KEY = 'mco.paletteWide';
function readWidePalette(): boolean {
    try { return typeof window !== 'undefined' && window.localStorage.getItem(WIDE_PALETTE_KEY) === '1'; } catch { return false; }
}

// Tab configuration
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'assets', label: 'Assets', icon: <FolderOpen size={16} /> },
    { id: 'assembly', label: 'Assembly', icon: <Settings2 size={16} /> },
    { id: 'namer', label: 'Ad Namer', icon: <Tag size={16} /> },
];

function BuildModeContent({
    campaign,
    onUpdateCampaign,
    globalSettings,
    otherCampaigns,
}: BuildModeProps) {
    const [activeTab, setActiveTab] = useState<TabId>('assembly');
    const [isContextOpen, setIsContextOpen] = useState(false);
    // The copywriter's "Context" links open it on the Assembly Line.
    const openContext = useCallback(() => {
        setActiveTab('assembly');
        setIsContextOpen(true);
    }, []);
    const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
    const [paletteTab, setPaletteTab] = useState<PaletteTab>('copy');
    const [copyView, setCopyView] = useState<CopyView>('top');
    // The selected ad: Use fills it and the copywriter writes for it. It follows the row you work in.
    const [copyTargetId, setCopyTargetId] = useState<string | null>(campaign.rows[0]?.id ?? null);
    const [isPaletteWide, setIsPaletteWide] = useState(readWidePalette);
    const toggleWidePalette = useCallback(() => {
        setIsPaletteWide(wide => {
            try { window.localStorage.setItem(WIDE_PALETTE_KEY, wide ? '0' : '1'); } catch { /* private mode */ }
            return !wide;
        });
    }, []);
    const [driveAssets, setDriveAssets] = useState<Asset[]>([]);
    const [isImportingFromMeta, setIsImportingFromMeta] = useState(false);
    const [isAssetsLoading, setIsAssetsLoading] = useState(false);

    // Meta connection hook
    const { isConnected: metaConnected, fetchTopPerformers } = useMetaConnection();
    const { user, driveAccessToken } = useAuth();

    // Safe brief reference - handle legacy campaigns without brief
    const safeBrief: CampaignBrief = campaign.brief ?? DEFAULT_BRIEF;

    // Which ads use each Active Palette item
    const usage = useMemo(() =>
        copyUsage(campaign.rows, campaign.palette.active),
        [campaign.rows, campaign.palette.active]
    );

    // ========================================
    // Campaign Brief Handlers
    // ========================================

    // Latest campaign for async callbacks (page reads finish after more edits).
    // A layout effect, so it's current before the rows' own effects run (an ad
    // name saving itself reads it in the same commit as the change behind it).
    const campaignRef = useRef(campaign);
    useLayoutEffect(() => { campaignRef.current = campaign; }, [campaign]);

    const handleBriefChange = useCallback((updates: Partial<CampaignBrief>) => {
        onUpdateCampaign({
            brief: { ...(campaignRef.current.brief ?? DEFAULT_BRIEF), ...updates },
        });
    }, [onUpdateCampaign]);

    const updateBrief = useCallback((update: (brief: CampaignBrief) => CampaignBrief) => {
        const next = update(campaignRef.current.brief ?? DEFAULT_BRIEF);
        campaignRef.current = { ...campaignRef.current, brief: next };
        onUpdateCampaign({ brief: next });
    }, [onUpdateCampaign]);

    // Drive folder URL handler
    const handleDriveFolderUrlChange = useCallback((url: string | null) => {
        handleBriefChange({ driveFolderUrl: url });
    }, [handleBriefChange]);

    // Handle assets loaded from Drive
    const handleDriveAssetsLoaded = useCallback((assets: Asset[]) => {
        setDriveAssets(assets);
    }, []);

    // Refresh assets from stored folder URL (called after Drive reconnect)
    const handleRefreshAssets = useCallback(async () => {
        const folderUrl = safeBrief.driveFolderUrl;
        if (!folderUrl || !driveAccessToken) return;

        // Extract folder ID from URL
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        const folderId = match?.[1] || folderUrl;
        if (!folderId) return;

        setIsAssetsLoading(true);
        try {
            const loadedAssets = await loadFolderAssets(driveAccessToken, folderId);
            setDriveAssets(loadedAssets);
        } catch (err) {
            console.error('Failed to refresh assets:', err);
        } finally {
            setIsAssetsLoading(false);
        }
    }, [safeBrief.driveFolderUrl, driveAccessToken]);

    // Auto-refresh assets when Drive reconnects and assets are empty
    // This handles the OAuth redirect case where the inline callback can't execute
    React.useEffect(() => {
        // Only auto-refresh if:
        // 1. We have a stored folder URL
        // 2. Drive is now connected
        // 3. Assets are currently empty (need reloading)
        if (safeBrief.driveFolderUrl && driveAccessToken && driveAssets.length === 0) {
            handleRefreshAssets();
        }
    }, [safeBrief.driveFolderUrl, driveAccessToken, driveAssets.length, handleRefreshAssets]);

    // ========================================
    // Palette Handlers
    // ========================================

    const handleAddToActive = useCallback((itemOrItems: CopyItem | CopyItem[]) => {
        const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];

        // Deduplicate: skip items whose text already exists in active palette
        const existingTexts = new Set(
            campaign.palette.active.map(a => a.text.trim().toLowerCase())
        );
        const newItems = items.filter(item => !existingTexts.has(item.text.trim().toLowerCase()));

        if (newItems.length === 0) return; // All items already present

        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                active: [...campaign.palette.active, ...newItems],
            },
        }, `Add ${newItems.length} to Active Palette`);
    }, [campaign.palette, onUpdateCampaign]);

    const handleRemoveFromActive = useCallback((id: string) => {
        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                active: campaign.palette.active.filter(item => item.id !== id),
            },
        }, 'Remove from Active Palette');
    }, [campaign.palette, onUpdateCampaign]);

    const handleRemoveManyFromActive = useCallback((ids: string[]) => {
        const drop = new Set(ids);
        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                active: campaign.palette.active.filter(item => !drop.has(item.id)),
            },
        }, `Remove ${ids.length} from Active Palette`);
    }, [campaign.palette, onUpdateCampaign]);

    // Import top performers from Meta: the copy behind most of the spend (see topCopy.ts)
    const [importNote, setImportNote] = useState<{ ok: boolean; message: string } | null>(null);
    const handleImportFromMeta = useCallback(async (productFilter?: string) => {
        setIsImportingFromMeta(true);
        setImportNote(null);
        try {
            const ads = await fetchTopPerformers({ datePreset: 'last_90d', limit: 200 });
            const filter = productFilter?.trim();
            const { items, matchedAds } = aggregateTopCopy(ads, filter);
            if (matchedAds === 0 || items.length === 0) {
                setImportNote({ ok: false, message: filter ? `No ads with spend in the last 90 days match "${filter}".` : 'No ads with spend in the last 90 days.' });
                return;
            }
            const now = Date.now();
            const current = campaignRef.current;
            const keyOf = (i: { type: string; text: string }) => `${i.type}:${i.text.trim().toLowerCase()}`;
            const existing = new Set(current.palette.historical.map(keyOf));
            const fresh: CopyItem[] = items
                .filter(i => !existing.has(keyOf(i)))
                .map((i, index) => ({
                    id: `meta-${i.type === 'headline' ? 'h' : 'pt'}-${index}-${now}`,
                    text: i.text,
                    type: i.type,
                    source: 'historical' as const,
                    metrics: { spend: i.spend, ctr: i.ctr, roas: i.roas },
                    sourceAdNames: i.adNames,
                    createdAt: new Date(),
                }));
            const count = (type: CopyItem['type']) => {
                const n = fresh.filter(i => i.type === type).length;
                return `${n} ${type === 'headline' ? (n === 1 ? 'headline' : 'headlines') : (n === 1 ? 'primary text' : 'primary texts')}`;
            };
            const from = filter ? ` from "${filter}" ads` : '';
            if (fresh.length === 0) {
                setImportNote({ ok: true, message: `Already up to date${from}.` });
                return;
            }
            onUpdateCampaign({
                palette: { ...current.palette, historical: [...fresh, ...current.palette.historical] },
            }, `Import ${fresh.length} top performers from Meta`);
            setImportNote({ ok: true, message: `Added ${count('headline')} and ${count('primary_text')}${from}.` });
        } catch (error) {
            console.error('Failed to import from Meta:', error);
            setImportNote({ ok: false, message: `Couldn't import from Meta: ${error instanceof Error ? error.message : 'unknown error'}` });
        } finally {
            setIsImportingFromMeta(false);
        }
    }, [fetchTopPerformers, onUpdateCampaign]);

    // Clear the historical palette (does not affect active palette)
    const handleClearHistorical = useCallback(() => {
        if (campaign.palette.historical.length === 0) return;

        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                historical: [],
            },
        }, 'Cleared Top Performers palette');
    }, [campaign.palette, onUpdateCampaign]);

    // Edit Active Palette item AND propagate changes to non-customized slots
    const handleEditActiveItem = useCallback((id: string, newText: string) => {
        // Find the item being edited
        const editedItem = campaign.palette.active.find(item => item.id === id);
        if (!editedItem) return;

        // Update the palette item
        const updatedPalette = {
            ...campaign.palette,
            active: campaign.palette.active.map(item =>
                item.id === id ? { ...item, text: newText } : item
            ),
        };

        // Propagate to all non-customized slots in rows that reference this item
        const updatedRows = campaign.rows.map(row => {
            let hasChanges = false;
            const updatedSlots = { ...row.slots };

            // Update primary texts
            const newPrimaryTexts = updatedSlots.primaryTexts.map(slot => {
                if (slot && slot.masterItem.id === id && !slot.isCustomized) {
                    hasChanges = true;
                    return {
                        ...slot,
                        masterItem: { ...slot.masterItem, text: newText },
                    };
                }
                return slot;
            });

            // Update headlines
            const newHeadlines = updatedSlots.headlines.map(slot => {
                if (slot && slot.masterItem.id === id && !slot.isCustomized) {
                    hasChanges = true;
                    return {
                        ...slot,
                        masterItem: { ...slot.masterItem, text: newText },
                    };
                }
                return slot;
            });

            if (hasChanges) {
                return {
                    ...row,
                    slots: {
                        ...updatedSlots,
                        primaryTexts: newPrimaryTexts,
                        headlines: newHeadlines,
                    },
                    updatedAt: new Date(),
                };
            }
            return row;
        });

        onUpdateCampaign({
            palette: updatedPalette,
            rows: updatedRows,
        }, 'Edit Palette item (global update)');
    }, [campaign.palette, campaign.rows, onUpdateCampaign]);

    // ========================================
    // Assembly Line Handlers
    // ========================================

    // Builds on the latest rows (campaignRef), so updates from several rows in
    // one tick, such as ad names saving themselves, don't overwrite each other.
    const handleUpdateRow = useCallback((rowId: string, updates: Partial<AdRow>) => {
        const current = campaignRef.current;
        const rows = current.rows.map(row =>
            row.id === rowId ? { ...row, ...updates, updatedAt: new Date() } : row
        );
        campaignRef.current = { ...current, rows };
        onUpdateCampaign({ rows }, 'Update row');
    }, [onUpdateCampaign]);

    const handleDeleteRow = useCallback((rowId: string) => {
        onUpdateCampaign({
            rows: campaign.rows.filter(row => row.id !== rowId),
        }, 'Delete row');
    }, [campaign.rows, onUpdateCampaign]);

    const handleDuplicateRow = useCallback((rowId: string) => {
        const rowToDuplicate = campaign.rows.find(row => row.id === rowId);
        if (rowToDuplicate) {
            const newRow: AdRow = {
                ...rowToDuplicate,
                id: `row-${Date.now()}`,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const index = campaign.rows.findIndex(row => row.id === rowId);
            const newRows = [...campaign.rows];
            newRows.splice(index + 1, 0, newRow);
            onUpdateCampaign({ rows: newRows }, 'Duplicate row');
            setCopyTargetId(newRow.id);
        }
    }, [campaign.rows, onUpdateCampaign]);

    const handleDuplicateStructure = useCallback((rowId: string) => {
        const rowToDuplicate = campaign.rows.find(row => row.id === rowId);
        if (rowToDuplicate) {
            const newRow: AdRow = {
                ...rowToDuplicate,
                id: `row-${Date.now()}`,
                assets: [], // Strip assets
                slots: {
                    ...rowToDuplicate.slots,
                    // Assets are stripped, so shrink carousel-grown headline
                    // slots back (filled ones are kept)
                    headlines: normalizeHeadlineSlots(rowToDuplicate.slots.headlines, rowToDuplicate.adType, 0),
                },
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const index = campaign.rows.findIndex(row => row.id === rowId);
            const newRows = [...campaign.rows];
            newRows.splice(index + 1, 0, newRow);
            onUpdateCampaign({ rows: newRows }, 'Duplicate structure');
            setCopyTargetId(newRow.id);
        }
    }, [campaign.rows, onUpdateCampaign]);

    const handleAddRow = useCallback(() => {
        const emptySlots: AdRowSlots = {
            primaryTexts: [null, null, null, null, null],
            headlines: [null, null, null, null, null],
            destinationUrl: null,
        };
        const newRow: AdRow = {
            id: `row-${Date.now()}`,
            assets: [],
            slots: emptySlots,
            // adType intentionally omitted - user must select
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        onUpdateCampaign({ rows: [...campaign.rows, newRow] }, 'Add row');
        setCopyTargetId(newRow.id);
    }, [campaign.rows, onUpdateCampaign]);

    // Apply to All Rows - applies a single slot item to the same position in all rows
    const handleApplyToAllRows = useCallback((
        slotType: 'headline' | 'primary_text',
        slotIndex: number,
        item: SlotItem
    ) => {
        const updatedRows = campaign.rows.map(row => {
            const updatedSlots = { ...row.slots };

            if (slotType === 'headline') {
                // Rows can have different headline counts (carousels grow theirs) —
                // skip rows without this slot rather than creating sparse arrays
                if (slotIndex >= updatedSlots.headlines.length) return row;
                const newHeadlines = [...updatedSlots.headlines];
                newHeadlines[slotIndex] = { ...item }; // Clone to avoid reference issues
                updatedSlots.headlines = newHeadlines;
            } else {
                if (slotIndex >= updatedSlots.primaryTexts.length) return row;
                const newPrimaryTexts = [...updatedSlots.primaryTexts];
                newPrimaryTexts[slotIndex] = { ...item };
                updatedSlots.primaryTexts = newPrimaryTexts;
            }

            return { ...row, slots: updatedSlots, updatedAt: new Date() };
        });

        const previewText = (item.localText || item.masterItem.text).slice(0, 25);
        onUpdateCampaign(
            { rows: updatedRows },
            `Apply "${previewText}..." to ${slotType === 'headline' ? 'Headline' : 'Primary Text'} ${slotIndex + 1} across all rows`
        );
    }, [campaign.rows, onUpdateCampaign]);

    // ========================================
    // Copywriter
    // ========================================

    const copywriterRef = useRef<CopywriterHandle>(null);
    // Keep the target on a real row (rows get added, deleted, reordered)
    const effectiveTargetId = campaign.rows.some(r => r.id === copyTargetId) ? copyTargetId : campaign.rows[0]?.id ?? null;

    // The copywriter lives in the Palette: a row's sparkle opens it on the Copywriter tab.
    const showCopywriter = useCallback(() => {
        setIsPaletteCollapsed(false);
        setPaletteTab('copy');
        setCopyView('write');
    }, []);

    const handleAimCopywriter = useCallback((rowId: string) => {
        setCopyTargetId(rowId);
        showCopywriter();
        copywriterRef.current?.open();
    }, [showCopywriter]);

    // Top Performers are shared context for every row (part of the cached prefix)
    const topCopy = useMemo(() => pickTopCopy(campaign.palette.historical.map(i => ({
        type: i.type, text: i.text, spend: i.metrics?.spend, ctr: i.metrics?.ctr,
    }))), [campaign.palette.historical]);

    const handleRiff = useCallback((item: CopyItem) => {
        showCopywriter();
        copywriterRef.current?.riff(item);
    }, [showCopywriter]);

    const handleTargetRow = useCallback((rowId: string) => {
        setCopyTargetId(rowId);
        document.getElementById(`ad-row-${rowId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    // Drop chosen copy into the row's next empty slot, and into the Active Palette.
    const handleUseCopy = useCallback((rowId: string, item: CopyItem): UseCopyResult => {
        const current = campaignRef.current;
        const index = current.rows.findIndex(r => r.id === rowId);
        if (index === -1) return { ok: false, message: 'That row no longer exists' };
        const row = current.rows[index];
        const place = findSlotFor(row, item.type, item.text);
        const column = item.type === 'headline' ? 'Headline' : 'Primary text';
        if (!place.ok) {
            return {
                ok: false,
                message: place.reason === 'duplicate'
                    ? `Already in ${rowLabel(row, index)}`
                    : `${column} slots in ${rowLabel(row, index)} are full. Drag it onto one to replace it.`,
            };
        }
        const norm = (t: string) => t.trim().toLowerCase();
        const existing = current.palette.active.find(a => a.type === item.type && norm(a.text) === norm(item.text));
        // New to Active: keep where it came from (top performer, AI); a top performer gets its own id, as when dragged in.
        const master: CopyItem = existing ?? {
            ...item,
            id: item.source === 'historical' ? `${item.id}-copy-${Date.now()}` : item.id,
            source: item.source ?? 'ai_generated',
            createdAt: new Date(),
        };
        const key = item.type === 'headline' ? 'headlines' : 'primaryTexts';
        const nextSlots = [...row.slots[key]];
        nextSlots[place.slotIndex] = { masterItem: master, isCustomized: false };
        const updates: Partial<Campaign> = {
            rows: current.rows.map(r => (r.id === rowId
                ? { ...r, slots: { ...r.slots, [key]: nextSlots }, updatedAt: new Date() }
                : r)),
            palette: existing ? current.palette : { ...current.palette, active: [...current.palette.active, master] },
        };
        campaignRef.current = { ...current, ...updates } as Campaign;
        onUpdateCampaign(updates, 'Use copy');
        return { ok: true, message: `Added to ${rowLabel(row, index)} · ${column} ${place.slotIndex + 1}` };
    }, [onUpdateCampaign]);

    // Fill this ad: each piece goes into the row's next empty slot of its type, in
    // order, until it has what was asked for (copy already in the ad is skipped).
    const handleFill = useCallback((rowId: string, items: CopyItem[], counts: { headlines: number; primaryTexts: number }): UseCopyResult => {
        const placed = { headlines: 0, primaryTexts: 0 };
        for (const item of items) {
            const key = item.type === 'headline' ? 'headlines' : 'primaryTexts';
            if (placed[key] >= counts[key]) continue;
            if (handleUseCopy(rowId, item).ok) placed[key]++;
        }
        const rows = campaignRef.current.rows;
        const index = rows.findIndex(r => r.id === rowId);
        const label = index >= 0 ? rowLabel(rows[index], index) : 'the ad';
        if (placed.headlines + placed.primaryTexts === 0) {
            return { ok: false, message: `Nothing went into ${label}: its slots are full or already hold this copy.` };
        }
        return { ok: true, message: `Filled ${countPhrase(placed)} in ${label}.` };
    }, [handleUseCopy]);

    // The selected ad as every copy card sees it: Use, "In ad" and "Full" all come from here.
    const copyTarget = useMemo<CopyTarget>(() => {
        const index = campaign.rows.findIndex(r => r.id === effectiveTargetId);
        const row = index >= 0 ? campaign.rows[index] : null;
        return {
            label: row ? rowLabel(row, index) : null,
            placeFor: item => {
                if (!row) return null;
                const place = findSlotFor(row, item.type, item.text);
                return place.ok ? 'free' : place.reason === 'duplicate' ? 'in' : 'full';
            },
            use: item => (row ? handleUseCopy(row.id, item) : { ok: false, message: 'Add an ad first' }),
        };
    }, [campaign.rows, effectiveTargetId, handleUseCopy]);

    // ========================================
    // Render
    // ========================================

    return (
        <div className="flex flex-col h-full">
            {/* Tab Bar */}
            <div className="flex border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
                            flex items-center gap-2 px-5 py-3 text-sm font-medium
                            border-b-2 transition-all duration-200
                            ${activeTab === tab.id
                                ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--bg-primary)]'
                                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                            }
                        `}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Tab Content */}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full" style={{ display: activeTab === 'assets' ? 'block' : 'none' }}>
                        <AssetLibrary
                            driveFolderUrl={safeBrief.driveFolderUrl}
                            onDriveFolderUrlChange={handleDriveFolderUrlChange}
                            assets={driveAssets}
                            onAssetsLoaded={handleDriveAssetsLoaded}
                        />
                    </div>

                    <div className="h-full" style={{ display: activeTab === 'assembly' ? 'block' : 'none' }}>
                        <AssemblyLine
                            rows={campaign.rows}
                            onUpdateRow={handleUpdateRow}
                            onDeleteRow={handleDeleteRow}
                            onDuplicateRow={handleDuplicateRow}
                            onDuplicateStructure={handleDuplicateStructure}
                            onAddRow={handleAddRow}
                            onApplyToAllRows={handleApplyToAllRows}
                            cachedDriveAssets={driveAssets}
                            onAddToActive={handleAddToActive}
                            userName={user?.displayName || undefined}
                            globalSettings={globalSettings}
                            onRefreshAssets={handleRefreshAssets}
                            hasFolderConfigured={!!safeBrief.driveFolderUrl}
                            isAssetsLoading={isAssetsLoading}
                            copyTargetRowId={effectiveTargetId}
                            onAimCopywriter={handleAimCopywriter}
                            onSelectRow={setCopyTargetId}
                            contextButton={
                                <CampaignContextButton
                                    brief={safeBrief}
                                    open={isContextOpen}
                                    onToggle={() => setIsContextOpen(o => !o)}
                                />
                            }
                            contextPanel={
                                <CampaignContextPanel
                                    brief={safeBrief}
                                    onBriefChange={updateBrief}
                                    otherCampaigns={otherCampaigns}
                                    open={isContextOpen}
                                    onClose={() => setIsContextOpen(false)}
                                />
                            }
                        />
                    </div>

                    <div className="h-full" style={{ display: activeTab === 'namer' ? 'block' : 'none' }}>
                        <AdNamer globalSettings={globalSettings} />
                    </div>
                </div>

                {/* Palette (Always Visible): copy library and the copywriter */}
                <Palette
                    historicalItems={campaign.palette.historical}
                    activeItems={campaign.palette.active}
                    onRemoveFromActive={handleRemoveFromActive}
                    onRemoveManyFromActive={handleRemoveManyFromActive}
                    onEditActiveItem={handleEditActiveItem}
                    isCollapsed={isPaletteCollapsed}
                    onToggleCollapse={() => setIsPaletteCollapsed(!isPaletteCollapsed)}
                    usage={usage}
                    onImportFromMeta={handleImportFromMeta}
                    isImportingFromMeta={isImportingFromMeta}
                    importNote={importNote}
                    onDismissImportNote={() => setImportNote(null)}
                    metaConnected={metaConnected}
                    onClearHistorical={handleClearHistorical}
                    onRiff={handleRiff}
                    rows={campaign.rows}
                    targetRowId={effectiveTargetId}
                    onTargetRow={handleTargetRow}
                    target={copyTarget}
                    tab={paletteTab}
                    onTabChange={setPaletteTab}
                    copyView={copyView}
                    onCopyViewChange={setCopyView}
                    isWide={isPaletteWide}
                    onToggleWide={toggleWidePalette}
                    copywriter={
                        <CopywriterPanel
                            ref={copywriterRef}
                            rows={campaign.rows}
                            targetRowId={effectiveTargetId}
                            brief={safeBrief}
                            onBriefChange={updateBrief}
                            globalSettings={globalSettings}
                            target={copyTarget}
                            onOpenContext={openContext}
                            topCopy={topCopy}
                            visible={!isPaletteCollapsed && paletteTab === 'copy' && copyView === 'write'}
                            onFill={handleFill}
                        />
                    }
                />
            </div>
        </div>
    );
}

export function BuildMode(props: BuildModeProps) {
    return (
        <DndProvider>
            <BuildModeContent {...props} />
        </DndProvider>
    );
}
