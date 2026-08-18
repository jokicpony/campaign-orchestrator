'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import { Plus, Eye, Undo2, Redo2, GripVertical, Loader2, Check, ChevronDown, Archive, Trash2, Hammer } from 'lucide-react';
import { Campaign } from '@/types';
import { UserMenu } from './UserMenu';
import { DeleteCampaignModal } from './DeleteCampaignModal';

interface CampaignTabsProps {
    campaigns: Campaign[];
    activeCampaignId: string;
    onSelectCampaign: (id: string) => void;
    onAddCampaign: () => void;
    onCloseCampaign: (id: string) => void;
    onArchiveCampaign: (id: string) => void;
    onRenameCampaign: (id: string, newName: string) => void;
    onReorderCampaigns?: (campaigns: Campaign[]) => void;
    mode: 'build' | 'review';
    onToggleMode: () => void;
    onOpenSettings: () => void;
    // Save status
    saving?: boolean;
    // Undo/Redo props
    canUndo?: boolean;
    canRedo?: boolean;
    onUndo?: () => void;
    onRedo?: () => void;
    undoDescription?: string;
    redoDescription?: string;
}

export function CampaignTabs({
    campaigns,
    activeCampaignId,
    onSelectCampaign,
    onAddCampaign,
    onCloseCampaign,
    onArchiveCampaign,
    onRenameCampaign,
    onReorderCampaigns,
    mode,
    onToggleMode,
    onOpenSettings,
    saving = false,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    undoDescription,
    redoDescription,
}: CampaignTabsProps) {
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');
    const [pendingDeleteCampaign, setPendingDeleteCampaign] = React.useState<Campaign | null>(null);
    const [showSaved, setShowSaved] = useState(false);
    const [displaySaving, setDisplaySaving] = useState(false);
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const savingStartTimeRef = React.useRef<number>(0);


    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpenDropdownId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Show "Saving..." the moment a save starts (state adjustment during
    // render); the minimum display time is enforced by the effect below.
    const [prevSaving, setPrevSaving] = useState(saving);
    if (saving !== prevSaving) {
        setPrevSaving(saving);
        if (saving) {
            setDisplaySaving(true);
            setShowSaved(false);
        }
    }

    // Hold "Saving..." for at least 500ms, then flash "Saved" for 2s
    useEffect(() => {
        if (saving) {
            savingStartTimeRef.current = Date.now();
            return;
        }
        if (!displaySaving) return;

        const elapsed = Date.now() - savingStartTimeRef.current;
        const minDisplayTime = 500;
        const remainingTime = Math.max(0, minDisplayTime - elapsed);

        const timer = setTimeout(() => {
            setDisplaySaving(false);
            setShowSaved(true);
            // Hide "Saved" after 2 seconds
            setTimeout(() => setShowSaved(false), 2000);
        }, remainingTime);

        return () => clearTimeout(timer);
    }, [saving, displaySaving]);

    const startEdit = (campaign: Campaign) => {
        setEditingId(campaign.id);
        setEditName(campaign.name);
    };

    const saveEdit = () => {
        if (editingId && editName.trim()) {
            onRenameCampaign(editingId, editName.trim());
        }
        setEditingId(null);
    };

    return (
        <header className="relative z-50 flex items-center bg-background-secondary border-b border-border">
            {/* Logo */}
            <div className="flex items-center gap-2 px-4 py-3 border-r border-border">
                <img
                    src="/logo.png"
                    alt="Campaign Orchestrator"
                    className="w-8 h-8 rounded-lg"
                />
                <span className="font-semibold text-sm hidden lg:block">Campaign Orchestrator</span>
            </div>

            {/* Undo/Redo - integrated into header */}
            {onUndo && onRedo && (
                <div className="flex items-center border-r border-border">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`p-3 transition-colors ${canUndo
                            ? 'hover:bg-background-tertiary text-foreground'
                            : 'text-foreground-subtle/40 cursor-not-allowed'
                            }`}
                        title={undoDescription ? `Undo: ${undoDescription}` : 'Undo (⌘Z)'}
                    >
                        <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        className={`p-3 transition-colors ${canRedo
                            ? 'hover:bg-background-tertiary text-foreground'
                            : 'text-foreground-subtle/40 cursor-not-allowed'
                            }`}
                        title={redoDescription ? `Redo: ${redoDescription}` : 'Redo (⌘⇧Z)'}
                    >
                        <Redo2 className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Tabs - Reorderable */}
            <div className="flex-1 flex items-center overflow-visible">
                <Reorder.Group
                    as="div"
                    axis="x"
                    values={campaigns}
                    onReorder={(reordered) => onReorderCampaigns?.(reordered)}
                    className="flex items-center"
                >
                    {campaigns.map((campaign) => (
                        <Reorder.Item
                            key={campaign.id}
                            value={campaign}
                            as="div"
                            className={`
                                group relative flex items-center gap-2 px-4 py-3 border-r border-border cursor-pointer
                                ${campaign.id === activeCampaignId
                                    ? 'bg-background text-foreground'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'}
                            `}
                            onClick={() => onSelectCampaign(campaign.id)}
                            whileDrag={{ scale: 1.02, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                        >
                            {/* Drag handle - subtle on hover */}
                            <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
                                <GripVertical className="w-3 h-3" />
                            </div>

                            {editingId === campaign.id ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onBlur={saveEdit}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit();
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    autoFocus
                                    className="bg-transparent text-sm focus:outline-none w-32"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span
                                    className="text-sm font-medium truncate max-w-[120px]"
                                    onDoubleClick={() => startEdit(campaign)}
                                >
                                    {campaign.name}
                                </span>
                            )}

                            {/* Dropdown menu button */}
                            {campaigns.length > 1 && (
                                <div className="relative" ref={openDropdownId === campaign.id ? dropdownRef : undefined}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenDropdownId(openDropdownId === campaign.id ? null : campaign.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-background-tertiary transition-all"
                                    >
                                        <ChevronDown className="w-3 h-3" />
                                    </button>

                                    {/* Dropdown menu */}
                                    <AnimatePresence>
                                        {openDropdownId === campaign.id && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -5 }}
                                                className="absolute top-full right-0 mt-1 w-32 py-1 bg-background-secondary border border-border rounded-lg shadow-xl z-[100]"
                                            >
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onArchiveCampaign(campaign.id);
                                                        setOpenDropdownId(null);
                                                    }}
                                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-background-tertiary transition-colors"
                                                >
                                                    <Archive className="w-3.5 h-3.5" />
                                                    Archive
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPendingDeleteCampaign(campaign);
                                                        setOpenDropdownId(null);
                                                    }}
                                                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-background-tertiary transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    Delete
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* Active indicator */}
                            {campaign.id === activeCampaignId && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                                />
                            )}
                        </Reorder.Item>
                    ))}
                </Reorder.Group>

                {/* Add tab button */}
                <button
                    onClick={onAddCampaign}
                    className="flex items-center justify-center w-10 h-full hover:bg-background-tertiary transition-colors"
                >
                    <Plus className="w-4 h-4 text-foreground-muted" />
                </button>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 px-4">

                {/* Save status indicator */}
                <AnimatePresence mode="wait">
                    {displaySaving && (
                        <motion.div
                            key="saving"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-primary/10 text-accent-primary text-xs font-medium"
                        >
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Saving...
                        </motion.div>
                    )}
                    {!saving && showSaved && (
                        <motion.div
                            key="saved"
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-success/10 text-accent-success text-xs font-medium"
                        >
                            <Check className="w-3 h-3" />
                            Saved
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mode toggle — pill with sliding indicator */}
                <div className="flex items-center bg-background-tertiary rounded-lg p-0.5 border border-border">
                    <button
                        onClick={() => mode !== 'build' && onToggleMode()}
                        className={`
                            relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200
                            ${mode === 'build'
                                ? 'bg-accent-primary text-white shadow-sm'
                                : 'text-foreground-muted hover:text-foreground'}
                        `}
                    >
                        <Hammer className="w-3.5 h-3.5" />
                        Build
                    </button>
                    <button
                        onClick={() => mode !== 'review' && onToggleMode()}
                        className={`
                            relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200
                            ${mode === 'review'
                                ? 'bg-accent-success text-white shadow-sm'
                                : 'text-foreground-muted hover:text-foreground'}
                        `}
                    >
                        <Eye className="w-3.5 h-3.5" />
                        Review
                    </button>
                </div>

                {/* User Menu */}
                <UserMenu onOpenSettings={onOpenSettings} />
            </div>

            {/* Delete Confirmation Modal */}
            <DeleteCampaignModal
                isOpen={!!pendingDeleteCampaign}
                onClose={() => setPendingDeleteCampaign(null)}
                onConfirm={() => {
                    if (pendingDeleteCampaign) {
                        onCloseCampaign(pendingDeleteCampaign.id);
                    }
                }}
                campaignName={pendingDeleteCampaign?.name || ''}
            />
        </header>
    );
}
