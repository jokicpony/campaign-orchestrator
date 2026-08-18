'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Settings2, Package, Users, Sparkles, Link, Wand2, Layers, Archive } from 'lucide-react';
import { GlobalPromptSettings, Campaign } from '@/types';
import { BrandVoiceSettings } from './BrandVoiceSettings';
import { ProductsSettings } from './ProductsSettings';
import { PersonasSettings } from './PersonasSettings';
import { ModifiersSettings } from './ModifiersSettings';
import { ConnectionsSettings } from './ConnectionsSettings';
import { AdSetupSettings } from './AdSetupSettings';
import { ArchivedCampaigns } from './ArchivedCampaigns';

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

type TabId = 'connections' | 'archived' | 'adsetup' | 'brand' | 'products' | 'personas' | 'modifiers';

// Grouped tabs for visual organization
const CONNECTIONS_TAB = { id: 'connections' as TabId, label: 'Connections', icon: <Link className="w-4 h-4" /> };
const ARCHIVED_TAB = { id: 'archived' as TabId, label: 'Archived', icon: <Archive className="w-4 h-4" /> };
const AD_SETUP_TAB = { id: 'adsetup' as TabId, label: 'Ad Setup', icon: <Layers className="w-4 h-4" /> };

const AI_COWRITER_TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'brand', label: 'Brand Voice', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" /> },
    { id: 'personas', label: 'Personas', icon: <Users className="w-4 h-4" /> },
    { id: 'modifiers', label: 'Modifiers', icon: <Sparkles className="w-4 h-4" /> },
];

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

    // Reset local settings when modal opens with new settings
    useEffect(() => {
        if (isOpen) {
            setLocalSettings(settings);
            setHasChanges(false);
        }
    }, [isOpen, settings]);

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

    const handleCancel = () => {
        if (hasChanges) {
            // Could add confirmation dialog here
        }
        onClose();
    };

    if (!isOpen) return null;

    // Check if current tab is an AI Co-Writer tab (needs save button)
    const isAiCowriterTab = activeTab !== 'connections' && activeTab !== 'archived';

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
                            {isAiCowriterTab && (
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
                            {/* Connections Tab */}
                            <button
                                onClick={() => setActiveTab(CONNECTIONS_TAB.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === CONNECTIONS_TAB.id
                                    ? 'bg-accent-primary/20 text-accent-primary'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'
                                    }`}
                            >
                                {CONNECTIONS_TAB.icon}
                                {CONNECTIONS_TAB.label}
                            </button>

                            {/* Ad Setup Tab (combined Ad Types + Naming) */}
                            <button
                                onClick={() => setActiveTab(AD_SETUP_TAB.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === AD_SETUP_TAB.id
                                    ? 'bg-accent-primary/20 text-accent-primary'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'
                                    }`}
                            >
                                {AD_SETUP_TAB.icon}
                                {AD_SETUP_TAB.label}
                            </button>

                            {/* Archived Campaigns Tab */}
                            <button
                                onClick={() => setActiveTab(ARCHIVED_TAB.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === ARCHIVED_TAB.id
                                    ? 'bg-accent-primary/20 text-accent-primary'
                                    : 'text-foreground-muted hover:text-foreground hover:bg-background-tertiary'
                                    }`}
                            >
                                {ARCHIVED_TAB.icon}
                                {ARCHIVED_TAB.label}
                            </button>

                            {/* Divider with AI Co-Writer label */}
                            <div className="pt-4 pb-2">
                                <div className="flex items-center gap-2 px-3 py-1">
                                    <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-subtle">
                                        AI Co-Writer
                                    </span>
                                </div>
                            </div>

                            {/* AI Co-Writer Tabs */}
                            {AI_COWRITER_TABS.map(tab => (
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
                            {activeTab === 'products' && (
                                <ProductsSettings
                                    products={localSettings.products}
                                    onChange={(products) => handleSettingsChange({ products })}
                                />
                            )}
                            {activeTab === 'personas' && (
                                <PersonasSettings
                                    personas={localSettings.customerPersonas}
                                    onChange={(customerPersonas) => handleSettingsChange({ customerPersonas })}
                                />
                            )}
                            {activeTab === 'modifiers' && (
                                <ModifiersSettings
                                    modifiers={localSettings.modifiers}
                                    iterationActions={localSettings.iterationActions}
                                    onModifiersChange={(modifiers) => handleSettingsChange({ modifiers })}
                                    onIterationActionsChange={(iterationActions) => handleSettingsChange({ iterationActions })}
                                />
                            )}
                            {activeTab === 'adsetup' && (
                                <AdSetupSettings
                                    settings={localSettings}
                                    onChange={handleSettingsChange}
                                />
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
