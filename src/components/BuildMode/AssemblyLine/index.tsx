'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Layers } from 'lucide-react';
import { AdRow as AdRowType, SlotItem, Asset, CopyItem, GlobalPromptSettings } from '@/types';
import { AdRow } from './AdRow';

interface AssemblyLineProps {
    rows: AdRowType[];
    onUpdateRow: (rowId: string, updates: Partial<AdRowType>) => void;
    onDeleteRow: (rowId: string) => void;
    onDuplicateRow: (rowId: string) => void;
    onDuplicateStructure: (rowId: string) => void;
    onAddRow: () => void;
    onApplyToAllRows: (slotType: 'headline' | 'primary_text', slotIndex: number, item: SlotItem) => void;
    // Drive assets (loaded at campaign level)
    cachedDriveAssets: Asset[];
    // Auto-add to Active Palette when dropping from historical
    onAddToActive?: (item: CopyItem) => void;
    // Current user's display name for comments
    userName?: string;
    // Global settings for naming conventions
    globalSettings?: GlobalPromptSettings;
    // Callback to trigger asset reload (e.g., after Drive reconnect)
    onRefreshAssets?: () => void;
    // Whether a Drive folder has been configured
    hasFolderConfigured?: boolean;
    // Whether assets are currently loading
    isAssetsLoading?: boolean;
    // Copywriter (in the Palette): which row it writes for, and how a row aims it
    copyTargetRowId?: string | null;
    onAimCopywriter?: (rowId: string) => void;
    /** Working in a row (a click or focus inside it) makes it the selected ad. */
    onSelectRow?: (rowId: string) => void;
    /** The campaign's Context: a button beside Add Row and the panel it opens under the header. */
    contextButton?: React.ReactNode;
    contextPanel?: React.ReactNode;
}

export function AssemblyLine({
    rows,
    onUpdateRow,
    onDeleteRow,
    onDuplicateRow,
    onDuplicateStructure,
    onAddRow,
    onApplyToAllRows,
    cachedDriveAssets,
    onAddToActive,
    userName,
    globalSettings,
    onRefreshAssets,
    hasFolderConfigured,
    isAssetsLoading,
    copyTargetRowId,
    onAimCopywriter,
    onSelectRow,
    contextButton,
    contextPanel,
}: AssemblyLineProps) {

    // Compute how many times each asset is used across all rows
    const usedAssetCounts = React.useMemo(() => {
        const counts: Record<string, number> = {};
        rows.forEach(row => {
            row.assets.forEach(asset => {
                counts[asset.id] = (counts[asset.id] || 0) + 1;
            });
        });
        return counts;
    }, [rows]);

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {/* Blue accent strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600 z-10" />

            {/* Header - fixed at top */}
            <div className="flex-shrink-0 px-6 pt-6 pb-4 pl-5 border-b border-blue-500/20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-blue-500/15">
                            <Layers className="w-5 h-5 text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-lg font-semibold text-foreground">Assembly Line</h2>
                            <span className="text-[10px] text-foreground-subtle">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {cachedDriveAssets.length > 0 && (
                            <span className="text-xs text-foreground-muted bg-accent-drive/10 text-accent-drive px-2 py-1 rounded-full">
                                {cachedDriveAssets.length} assets loaded
                            </span>
                        )}
                        {contextButton}
                        <button
                            onClick={onAddRow}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors text-sm font-medium text-white"
                        >
                            <Plus className="w-4 h-4" />
                            Add Row
                        </button>
                    </div>
                </div>
            </div>

            {contextPanel}

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 pl-5">
                {rows.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border rounded-xl"
                    >
                        <Layers className="w-12 h-12 text-foreground-subtle mb-4" />
                        <p className="text-foreground-muted text-lg mb-6">No ads yet</p>
                        <button
                            onClick={onAddRow}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary-hover transition-colors font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Add Row
                        </button>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {rows.map((row, index) => (
                            <motion.div
                                key={row.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <AdRow
                                    row={row}
                                    rowIndex={index}
                                    onUpdate={(updates) => onUpdateRow(row.id, updates)}
                                    onDelete={() => onDeleteRow(row.id)}
                                    onDuplicate={() => onDuplicateRow(row.id)}
                                    onDuplicateStructure={() => onDuplicateStructure(row.id)}
                                    onApplyToAllRows={onApplyToAllRows}
                                    totalRows={rows.length}
                                    cachedDriveAssets={cachedDriveAssets}
                                    usedAssetCounts={usedAssetCounts}
                                    onAddToActive={onAddToActive}
                                    userName={userName}
                                    globalSettings={globalSettings}
                                    onRefreshAssets={onRefreshAssets}
                                    hasFolderConfigured={hasFolderConfigured}
                                    isAssetsLoading={isAssetsLoading}
                                    isCopyTarget={row.id === copyTargetRowId}
                                    onAimCopywriter={onAimCopywriter ? () => onAimCopywriter(row.id) : undefined}
                                    onSelect={onSelectRow ? () => onSelectRow(row.id) : undefined}
                                />
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
