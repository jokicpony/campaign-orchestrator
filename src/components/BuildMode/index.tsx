'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Campaign, AdRow, CopyItem, AdRowSlots, SlotItem, BrainConfig, Asset, GlobalPromptSettings, CampaignBrief, normalizeHeadlineSlots } from '@/types';
import { DndProvider } from '@/lib/dnd';
import { Brain } from './Brain';
import { Palette } from './Palette';
import { AssemblyLine } from './AssemblyLine';
import { AssetLibrary } from './AssetLibrary';
import { AdNamer } from './AdNamer';
import { FolderOpen, Brain as BrainIcon, Settings2, Tag } from 'lucide-react';
import { useMetaConnection } from '@/hooks';
import { useAuth } from '@/components/AuthContext';
import { loadFolderAssets } from '@/lib/google';

// Default brief for legacy campaigns that don't have the brief property
const DEFAULT_BRIEF: CampaignBrief = {
    productId: null,
    targetAudience: '',
    keyMessages: '',
    driveFolderUrl: null,
};


interface BuildModeProps {
    campaign: Campaign;
    onUpdateCampaign: (updates: Partial<Campaign>, actionDescription?: string) => void;
    globalSettings: GlobalPromptSettings;
    onUpdateGlobalSettings: (updates: Partial<GlobalPromptSettings>) => Promise<void>;
}

type TabId = 'assets' | 'brain' | 'assembly' | 'namer';

// Tab configuration
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'assets', label: 'Assets', icon: <FolderOpen size={16} /> },
    { id: 'brain', label: 'AI Co-Writer', icon: <BrainIcon size={16} /> },
    { id: 'assembly', label: 'Assembly', icon: <Settings2 size={16} /> },
    { id: 'namer', label: 'Ad Namer', icon: <Tag size={16} /> },
];

// Calculate how many times each Active Palette item is used in rows
function calculateUsageCounts(rows: AdRow[], activeItems: CopyItem[]): Map<string, number> {
    const counts = new Map<string, number>();

    // Initialize all active items to 0
    activeItems.forEach(item => counts.set(item.id, 0));

    // Count usage in all rows
    rows.forEach(row => {
        // Carousels publish only Primary Text 1 — copy parked in hidden
        // PT slots 2–5 shouldn't count as "used"
        const primaryTexts = row.adType === 'carousel'
            ? row.slots.primaryTexts.slice(0, 1)
            : row.slots.primaryTexts;
        const allSlots = [...primaryTexts, ...row.slots.headlines];
        allSlots.forEach(slot => {
            if (slot) {
                const masterId = slot.masterItem.id;
                if (counts.has(masterId)) {
                    counts.set(masterId, (counts.get(masterId) || 0) + 1);
                }
            }
        });
    });

    return counts;
}

function BuildModeContent({
    campaign,
    onUpdateCampaign,
    globalSettings,
}: BuildModeProps) {
    const [activeTab, setActiveTab] = useState<TabId>('assembly');
    const [isPaletteCollapsed, setIsPaletteCollapsed] = useState(false);
    const [driveAssets, setDriveAssets] = useState<Asset[]>([]);
    const [isImportingFromMeta, setIsImportingFromMeta] = useState(false);
    const [isAssetsLoading, setIsAssetsLoading] = useState(false);

    // Meta connection hook
    const { isConnected: metaConnected, fetchTopPerformers } = useMetaConnection();
    const { user, driveAccessToken } = useAuth();

    // Safe brief reference - handle legacy campaigns without brief
    const safeBrief: CampaignBrief = campaign.brief ?? DEFAULT_BRIEF;

    // Calculate usage counts for Active Palette items
    const usageCounts = useMemo(() =>
        calculateUsageCounts(campaign.rows, campaign.palette.active),
        [campaign.rows, campaign.palette.active]
    );

    // ========================================
    // Campaign Brief Handlers
    // ========================================

    const handleBriefChange = useCallback((updates: Partial<CampaignBrief>) => {
        onUpdateCampaign({
            brief: { ...safeBrief, ...updates },
        });
    }, [safeBrief, onUpdateCampaign]);

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

    // Add manual copy to palette
    const handleAddManualCopy = useCallback((text: string, type: 'headline' | 'primary_text') => {
        const newItem: CopyItem = {
            id: `manual-${Date.now()}`,
            text,
            type,
            source: 'manual',
            createdAt: new Date(),
        };
        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                active: [...campaign.palette.active, newItem],
            },
        }, 'Add manual copy');
    }, [campaign.palette, onUpdateCampaign]);

    const handleRemoveFromActive = useCallback((id: string) => {
        onUpdateCampaign({
            palette: {
                ...campaign.palette,
                active: campaign.palette.active.filter(item => item.id !== id),
            },
        }, 'Remove from Active Palette');
    }, [campaign.palette, onUpdateCampaign]);

    // Import top performers from Meta
    const handleImportFromMeta = useCallback(async (productFilter?: string) => {
        setIsImportingFromMeta(true);
        try {
            // Fetch more ads to get a good sample, then we'll take top 25%
            const topPerformers = await fetchTopPerformers({ datePreset: 'last_90d', limit: 200 });

            // Apply product filter if provided (case-insensitive match on ad name)
            const filteredPerformers = productFilter
                ? topPerformers.filter(p =>
                    p.adName.toLowerCase().includes(productFilter.toLowerCase()) ||
                    p.campaignName.toLowerCase().includes(productFilter.toLowerCase())
                )
                : topPerformers;

            if (filteredPerformers.length === 0) {
                console.log(`No ads found matching filter: ${productFilter}`);
                return;
            }

            // Aggregate metrics by unique copy text
            // Key: normalized text, Value: aggregated metrics
            interface AggregatedCopy {
                text: string;
                type: 'headline' | 'primary_text';
                totalSpend: number;
                totalImpressions: number;
                totalClicks: number;
                adCount: number;
                roasValues: number[];
                adNames: Set<string>;  // Track which ads this copy appeared in
            }

            const primaryTextMap = new Map<string, AggregatedCopy>();
            const headlineMap = new Map<string, AggregatedCopy>();

            filteredPerformers.forEach((performer) => {
                // Aggregate primary texts
                if (performer.primaryText) {
                    const key = performer.primaryText.trim();
                    const existing = primaryTextMap.get(key);
                    if (existing) {
                        existing.totalSpend += performer.spend;
                        existing.totalImpressions += performer.impressions;
                        existing.totalClicks += performer.clicks;
                        existing.adCount += 1;
                        if (performer.roas) existing.roasValues.push(performer.roas);
                        existing.adNames.add(performer.adName);
                    } else {
                        primaryTextMap.set(key, {
                            text: performer.primaryText,
                            type: 'primary_text',
                            totalSpend: performer.spend,
                            totalImpressions: performer.impressions,
                            totalClicks: performer.clicks,
                            adCount: 1,
                            roasValues: performer.roas ? [performer.roas] : [],
                            adNames: new Set([performer.adName]),
                        });
                    }
                }

                // Aggregate headlines
                if (performer.headline) {
                    const key = performer.headline.trim();
                    const existing = headlineMap.get(key);
                    if (existing) {
                        existing.totalSpend += performer.spend;
                        existing.totalImpressions += performer.impressions;
                        existing.totalClicks += performer.clicks;
                        existing.adCount += 1;
                        if (performer.roas) existing.roasValues.push(performer.roas);
                        existing.adNames.add(performer.adName);
                    } else {
                        headlineMap.set(key, {
                            text: performer.headline,
                            type: 'headline',
                            totalSpend: performer.spend,
                            totalImpressions: performer.impressions,
                            totalClicks: performer.clicks,
                            adCount: 1,
                            roasValues: performer.roas ? [performer.roas] : [],
                            adNames: new Set([performer.adName]),
                        });
                    }
                }
            });

            // Convert maps to arrays and sort by total spend
            const allAggregated = [
                ...Array.from(primaryTextMap.values()),
                ...Array.from(headlineMap.values()),
            ].sort((a, b) => b.totalSpend - a.totalSpend);

            // Take top 50%
            const top50PercentCount = Math.max(1, Math.ceil(allAggregated.length * 0.50));
            const topItems = allAggregated.slice(0, top50PercentCount);

            // Convert to CopyItem format
            const newHistoricalItems: CopyItem[] = topItems.map((item, index) => {
                // Calculate weighted average CTR
                const ctr = item.totalImpressions > 0
                    ? (item.totalClicks / item.totalImpressions) * 100
                    : 0;

                // Calculate average ROAS
                const avgRoas = item.roasValues.length > 0
                    ? item.roasValues.reduce((a, b) => a + b, 0) / item.roasValues.length
                    : undefined;

                return {
                    id: `meta-${item.type === 'headline' ? 'h' : 'pt'}-${index}-${Date.now()}`,
                    text: item.text,
                    type: item.type,
                    source: 'historical' as const,
                    metrics: {
                        spend: item.totalSpend,
                        ctr: ctr,
                        roas: avgRoas,
                    },
                    sourceAdNames: Array.from(item.adNames),  // Store ad names for filtering
                    createdAt: new Date(),
                };
            });

            // Deduplicate against existing items
            const existingTexts = new Set(campaign.palette.historical.map(i => i.text.trim()));
            const uniqueNewItems = newHistoricalItems.filter(item => !existingTexts.has(item.text.trim()));

            if (uniqueNewItems.length > 0) {
                const filterNote = productFilter ? ` (filtered by "${productFilter}")` : '';
                onUpdateCampaign({
                    palette: {
                        ...campaign.palette,
                        historical: [...uniqueNewItems, ...campaign.palette.historical],
                    },
                }, `Imported ${uniqueNewItems.length} top performers from Meta (top 50% by spend)${filterNote}`);
            }
        } catch (error) {
            console.error('Failed to import from Meta:', error);
        } finally {
            setIsImportingFromMeta(false);
        }
    }, [fetchTopPerformers, campaign.palette, onUpdateCampaign]);

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

    const handleUpdateRow = useCallback((rowId: string, updates: Partial<AdRow>) => {
        onUpdateCampaign({
            rows: campaign.rows.map(row =>
                row.id === rowId ? { ...row, ...updates, updatedAt: new Date() } : row
            ),
        }, 'Update row');
    }, [campaign.rows, onUpdateCampaign]);

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
    // Brain Config (Runtime session state)
    // ========================================

    // Session-level state for Brain controls (not persisted to campaign)
    const [sessionTemperature, setSessionTemperature] = useState(globalSettings.defaultTemperature);
    const [sessionModifiers, setSessionModifiers] = useState<string[]>([]);
    const [sessionPersonaId, setSessionPersonaId] = useState<string | undefined>(undefined);

    // Create a runtime BrainConfig from campaign brief + session state
    const brainConfig: BrainConfig = useMemo(() => ({
        context: safeBrief.keyMessages,
        temperature: sessionTemperature,
        activeModifiers: sessionModifiers,
        selectedProductId: safeBrief.productId || undefined,
        selectedPersonaId: sessionPersonaId,
    }), [safeBrief, sessionTemperature, sessionModifiers, sessionPersonaId]);

    const handleBrainConfigChange = useCallback((updates: Partial<BrainConfig>) => {
        // Update session state for temperature, modifiers, and persona
        if (updates.temperature !== undefined) {
            setSessionTemperature(updates.temperature);
        }
        if (updates.activeModifiers !== undefined) {
            setSessionModifiers(updates.activeModifiers);
        }
        if (updates.selectedPersonaId !== undefined) {
            setSessionPersonaId(updates.selectedPersonaId);
        }
        // Persist context and product selection to campaign brief
        if (updates.context !== undefined) {
            handleBriefChange({ keyMessages: updates.context });
        }
        if (updates.selectedProductId !== undefined) {
            handleBriefChange({ productId: updates.selectedProductId || null });
        }
    }, [handleBriefChange]);

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

                    <div className="h-full" style={{ display: activeTab === 'brain' ? 'block' : 'none' }}>
                        <Brain
                            config={brainConfig}
                            onConfigChange={handleBrainConfigChange}
                            onAddToActive={handleAddToActive}
                            onRemoveFromActive={handleRemoveFromActive}
                            globalSettings={globalSettings}
                            campaignBrief={safeBrief}
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
                        />
                    </div>

                    <div className="h-full" style={{ display: activeTab === 'namer' ? 'block' : 'none' }}>
                        <AdNamer globalSettings={globalSettings} />
                    </div>
                </div>

                {/* Palette (Always Visible) */}
                <Palette
                    historicalItems={campaign.palette.historical}
                    activeItems={campaign.palette.active}
                    onAddToActive={handleAddToActive}
                    onRemoveFromActive={handleRemoveFromActive}
                    onEditActiveItem={handleEditActiveItem}
                    onAddManualCopy={handleAddManualCopy}
                    isCollapsed={isPaletteCollapsed}
                    onToggleCollapse={() => setIsPaletteCollapsed(!isPaletteCollapsed)}
                    usageCounts={usageCounts}
                    onImportFromMeta={handleImportFromMeta}
                    isImportingFromMeta={isImportingFromMeta}
                    metaConnected={metaConnected}
                    onClearHistorical={handleClearHistorical}
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
