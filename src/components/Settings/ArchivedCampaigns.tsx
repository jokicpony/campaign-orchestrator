'use client';

import React, { useState } from 'react';
import { Archive, RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { Campaign } from '@/types';

interface ArchivedCampaignsProps {
    archivedCampaigns: Campaign[];
    onRestore: (id: string) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    saving?: boolean;
}

export function ArchivedCampaigns({
    archivedCampaigns,
    onRestore,
    onDelete,
    saving = false
}: ArchivedCampaignsProps) {
    const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null);

    // Calculate published count for a campaign
    const getPublishedCount = (campaign: Campaign) => {
        return campaign.rows.filter(row => row.lastPublishedAt).length;
    };

    const handleRestore = async (id: string) => {
        await onRestore(id);
    };

    const handleDelete = async () => {
        if (pendingDelete) {
            await onDelete(pendingDelete.id);
            setPendingDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Archived Campaigns</h3>
                <p className="text-sm text-foreground-muted">
                    Campaigns you&apos;ve archived are stored here. Restore them to bring them back to your workspace, or delete them permanently.
                </p>
            </div>

            {archivedCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-background-tertiary flex items-center justify-center mb-4">
                        <Archive className="w-8 h-8 text-foreground-muted" />
                    </div>
                    <p className="text-foreground-muted font-medium">No archived campaigns</p>
                    <p className="text-sm text-foreground-subtle mt-1">
                        Archived campaigns will appear here
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {archivedCampaigns.map(campaign => (
                        <div
                            key={campaign.id}
                            className="p-4 rounded-xl bg-background-secondary border border-border hover:border-border-hover transition-colors"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-foreground truncate">
                                        {campaign.name}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-1.5 text-sm text-foreground-muted">
                                        {campaign.archivedAt && (
                                            <span>
                                                Archived {new Date(campaign.archivedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                        <span className="text-foreground-subtle">•</span>
                                        <span>{campaign.rows.length} ads</span>
                                        <span className="text-foreground-subtle">•</span>
                                        <span>{getPublishedCount(campaign)} published</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleRestore(campaign.id)}
                                        disabled={saving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Restore
                                    </button>
                                    <button
                                        onClick={() => setPendingDelete(campaign)}
                                        disabled={saving}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {pendingDelete && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-background rounded-xl border border-border shadow-2xl p-6 max-w-md w-full mx-4">
                        <div className="flex items-center gap-3 text-red-400 mb-4">
                            <AlertTriangle className="w-6 h-6" />
                            <h3 className="text-lg font-semibold">Delete Campaign</h3>
                        </div>
                        <p className="text-foreground-muted mb-6">
                            Are you sure you want to permanently delete <strong className="text-foreground">&ldquo;{pendingDelete.name}&rdquo;</strong>?
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setPendingDelete(null)}
                                className="px-4 py-2 text-sm font-medium text-foreground-muted hover:text-foreground transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={saving}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
