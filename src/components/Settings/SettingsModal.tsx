'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Settings2, Sparkles, Link, Layers, Archive, BarChart3 } from 'lucide-react';
import { GlobalPromptSettings, Campaign } from '@/types';
import { BrandVoiceSettings } from './BrandVoiceSettings';
import { ConnectionsSettings } from './ConnectionsSettings';
import { AdSetupSettings } from './AdSetupSettings';
import { ArchivedCampaigns } from './ArchivedCampaigns';
import { UsageSettings } from './UsageSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: GlobalPromptSettings;
    onSave: (settings: GlobalPromptSettings) => Promise<void>;
    // Campaign archiving props
    archivedCampaigns: Campaign[];
    onRestoreCampaign: (id: string) => Promise<void>;
    onDeleteCampaign: (id: string) => Promise<void>;
    savingCampaigns?: boolean;
}

type TabId = 'connections' | 'adsetup' | 'brand' | 'usage' | 'archived';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'connections', label: 'Connections', icon: <Link className="w-4 h-4" /> },
    { id: 'adsetup', label: 'Ad Setup', icon: <Layers className="w-4 h-4" /> },
    { id: 'brand', label: 'Copywriter', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'usage', label: 'Usage', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'archived', label: 'Archived', icon: <Archive className="w-4 h-4" /> },
];

// Tabs whose edits are held locally until Save
const SAVED_TABS: TabId[] = ['adsetup', 'brand'];

export function SettingsModal({
    isOpen,
    onClose,
    settings,
    onSave,
    archivedCampaigns,
    onRestoreCampaign,
    onDeleteCampaign,
    savingCampaigns = false,
}: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<TabId>('connections');
    const [localSettings, setLocalSettings] = useState<GlobalPromptSettings>(settings);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Start from the team's settings each time the modal opens, and take the
    // fresh copy that arrives just after opening unless you've already edited.
    // (State adjusted during render rather than in an effect, per react.dev.)
    const [wasOpen, setWasOpen] = useState(isOpen);
    const [seenSettings, setSeenSettings] = useState(settings);
    if (isOpen !== wasOpen) {
        setWasOpen(isOpen);
        if (isOpen) {
            setLocalSettings(settings);
            setSeenSettings(settings);
            setHasChanges(false);
        }
    } else if (isOpen && settings !== seenSettings) {
        setSeenSettings(settings);
        if (!hasChanges) setLocalSettings(settings);
    }

    const handleSettingsChange = (updates: Partial<GlobalPromptSettings>) => {
        setLocalSettings(prev => ({ ...prev, ...updates }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave(localSettings);
            setHasChanges(false);
            // Don't close modal - let user continue editing or close manually with X
        } catch (error) {
            console.error('Failed to save settings:', error);
        } finally {
            setIsSaving(false);
        }
    };

    // Cancel, the X, a click outside and Escape all close; unsaved edits ask first.
    const handleCancel = useCallback(() => {
        if (hasChanges && !window.confirm('Discard your unsaved settings changes?')) return;
        onClose();
    }, [hasChanges, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !e.defaultPrevented) handleCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, handleCancel]);

    if (!isOpen) return null;

    const isSavedTab = SAVED_TABS.includes(activeTab);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={handleCancel}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-[95vw] max-w-5xl h-[85vh] bg-background rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background-secondary">
                        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                            <Settings2 className="w-5 h-5 text-accent-primary" />
                            Settings
                        </h2>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            {isSavedTab && (
                                <button
                                    onClick={handleSave}
                                    disabled={!hasChanges || isSaving}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Save className="w-4 h-4" />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            )}
                            <button
                                onClick={handleCancel}
                                className="p-2 text-foreground-muted hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Sidebar Tabs */}
                        <div className="w-52 border-r border-border bg-background-secondary p-3 space-y-1">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                        ? 'bg-accent-primary/20 text-accent-primary'
                                        : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'
                                        }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {activeTab === 'connections' && (
                                <ConnectionsSettings />
                            )}
                            {activeTab === 'brand' && (
                                <BrandVoiceSettings
                                    settings={localSettings}
                                    onChange={handleSettingsChange}
                                />
                            )}
                            {activeTab === 'adsetup' && (
                                <AdSetupSettings
                                    settings={localSettings}
                                    onChange={handleSettingsChange}
                                />
                            )}
                            {activeTab === 'usage' && (
                                <UsageSettings />
                            )}
                            {activeTab === 'archived' && (
                                <ArchivedCampaigns
                                    archivedCampaigns={archivedCampaigns}
                                    onRestore={onRestoreCampaign}
                                    onDelete={onDeleteCampaign}
                                    saving={savingCampaigns}
                                />
                            )}
                        </div>
                    </div>

                    {/* Footer with unsaved changes indicator */}
                    {hasChanges && (
                        <div className="px-6 py-3 border-t border-border bg-amber-500/10">
                            <p className="text-sm text-amber-600 flex items-center gap-2">
                                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                You have unsaved changes
                            </p>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
