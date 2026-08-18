'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Loader2, RefreshCw, AlertCircle, Image as ImageIcon, Video, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { loadFolderAssets, DriveAuthError, DriveFolderError } from '@/lib/google';
import { Asset } from '@/types';

interface DriveAssetPickerProps {
    campaignFolderId?: string;
    onFolderIdChange: (folderId: string) => void;
    onAssetsLoaded: (assets: Asset[]) => void;
    loadedAssets: Asset[];
}

export function DriveAssetPicker({
    campaignFolderId,
    onFolderIdChange,
    onAssetsLoaded,
    loadedAssets,
}: DriveAssetPickerProps) {
    const { driveAccessToken, reconnectDrive } = useAuth();

    const [folderIdInput, setFolderIdInput] = useState(campaignFolderId || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(true);

    const handleLoadAssets = useCallback(async () => {
        if (!folderIdInput.trim()) {
            setError('Please enter a folder ID');
            return;
        }

        if (!driveAccessToken) {
            setError('Drive not connected. Please reconnect.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const assets = await loadFolderAssets(driveAccessToken, folderIdInput.trim());
            onAssetsLoaded(assets);
            onFolderIdChange(folderIdInput.trim());
        } catch (err) {
            if (err instanceof DriveAuthError) {
                setError('Session expired. Please reconnect to Drive.');
            } else if (err instanceof DriveFolderError) {
                setError('Folder not found or you don\'t have access.');
            } else {
                setError('Failed to load assets. Check the folder ID.');
            }
            console.error('Drive load error:', err);
        } finally {
            setLoading(false);
        }
    }, [folderIdInput, driveAccessToken, onAssetsLoaded, onFolderIdChange]);

    const handleReconnect = useCallback(async () => {
        try {
            await reconnectDrive();
            setError(null);
        } catch {
            setError('Failed to reconnect. Please try again.');
        }
    }, [reconnectDrive]);

    const needsReconnect = !driveAccessToken || error?.includes('reconnect') || error?.includes('expired');

    return (
        <div className="bg-surface-secondary rounded-xl border border-white/5">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors rounded-xl"
            >
                <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-accent-drive" />
                    <span className="font-medium text-sm">Google Drive Assets</span>
                    {loadedAssets.length > 0 && (
                        <span className="text-xs text-foreground-muted bg-white/10 px-2 py-0.5 rounded-full">
                            {loadedAssets.length} loaded
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-foreground-muted" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-foreground-muted" />
                )}
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3">
                            {/* Folder ID Input */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={folderIdInput}
                                    onChange={(e) => setFolderIdInput(e.target.value)}
                                    placeholder="Enter Google Drive folder ID..."
                                    className="flex-1 bg-surface-tertiary rounded-lg px-3 py-2 text-sm placeholder:text-foreground-muted/50 border border-white/5 focus:border-accent-drive/50 focus:outline-none transition-colors"
                                />
                                {needsReconnect ? (
                                    <button
                                        onClick={handleReconnect}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium transition-colors"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        Reconnect
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleLoadAssets}
                                        disabled={loading || !folderIdInput.trim()}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-drive/20 hover:bg-accent-drive/30 text-accent-drive text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <FolderOpen className="w-4 h-4" />
                                        )}
                                        Load
                                    </button>
                                )}
                            </div>

                            {/* Help text */}
                            <p className="text-xs text-foreground-muted">
                                Find folder ID in the URL: drive.google.com/drive/folders/<span className="text-accent-drive">FOLDER_ID</span>
                            </p>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Asset Grid */}
                            {loadedAssets.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                    {loadedAssets.map((asset) => (
                                        <div
                                            key={asset.id}
                                            className="relative group aspect-square rounded-lg overflow-hidden bg-surface-tertiary border border-white/5 hover:border-accent-drive/50 transition-colors cursor-pointer"
                                        >
                                            {/* Thumbnail */}
                                            {asset.thumbnailUrl ? (
                                                <img
                                                    src={asset.thumbnailUrl}
                                                    alt={asset.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    {asset.type === 'video' ? (
                                                        <Video className="w-8 h-8 text-foreground-muted" />
                                                    ) : (
                                                        <ImageIcon className="w-8 h-8 text-foreground-muted" />
                                                    )}
                                                </div>
                                            )}

                                            {/* Type badge */}
                                            <div className="absolute top-1 left-1">
                                                {asset.type === 'video' ? (
                                                    <Video className="w-3 h-3 text-white drop-shadow-md" />
                                                ) : (
                                                    <ImageIcon className="w-3 h-3 text-white drop-shadow-md" />
                                                )}
                                            </div>

                                            {/* Hover overlay */}
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <a
                                                    href={asset.fullUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-white text-xs flex items-center gap-1"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    View
                                                </a>
                                            </div>

                                            {/* Name tooltip */}
                                            <div className="absolute bottom-0 left-0 right-0 p-1 bg-gradient-to-t from-black/80 to-transparent">
                                                <p className="text-xs text-white truncate">
                                                    {asset.name}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Empty state */}
                            {loadedAssets.length === 0 && !loading && !error && (
                                <div className="text-center py-6 text-foreground-muted text-sm">
                                    Enter a folder ID and click Load to fetch assets
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
