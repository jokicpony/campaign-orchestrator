'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Loader2, RefreshCw, AlertCircle, Check, Link2, HardDrive, Search, Film, Image as ImageIcon, Play } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { loadFolderAssets, DriveAuthError, DriveFolderError } from '@/lib/google';
import { Asset } from '@/types';
import { shapeLabel } from '@/lib/meta/multiMedia';

interface AssetLibraryProps {
    driveFolderUrl: string | null;
    onDriveFolderUrlChange: (url: string | null) => void;
    assets: Asset[];
    onAssetsLoaded: (assets: Asset[]) => void;
}

/**
 * Extract folder ID from various Google Drive URL formats:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * - Just the FOLDER_ID itself
 */
function extractFolderId(input: string): string {
    const trimmed = input.trim();

    // If it's already just an ID (no slashes or query params), return as-is
    if (!trimmed.includes('/') && !trimmed.includes('?')) {
        return trimmed;
    }

    // Try to extract from URL patterns
    const patterns = [
        /\/folders\/([a-zA-Z0-9_-]+)/,  // Matches /folders/ID
        /id=([a-zA-Z0-9_-]+)/,           // Matches id=ID
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
            return match[1];
        }
    }

    // Fallback: return as-is (might be just an ID)
    return trimmed;
}

export function AssetLibrary({
    driveFolderUrl,
    onDriveFolderUrlChange,
    assets,
    onAssetsLoaded,
}: AssetLibraryProps) {
    const { driveAccessToken, reconnectDrive } = useAuth();

    const [inputValue, setInputValue] = useState(driveFolderUrl || '');
    const [loading, setLoading] = useState(false);
    const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Sync input with external url
    useEffect(() => {
        if (driveFolderUrl && driveFolderUrl !== inputValue) {
            setInputValue(driveFolderUrl);
        }
    }, [driveFolderUrl]);

    // Track if we were waiting for reconnection
    const [pendingLoad, setPendingLoad] = useState(false);

    const handleLoadFolder = useCallback(async () => {
        const extractedId = extractFolderId(inputValue);

        if (!extractedId) {
            setError('Please enter a folder ID or URL');
            return;
        }

        if (!driveAccessToken) {
            // Don't show error - mark as pending and let user connect
            setPendingLoad(true);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const loadedAssets = await loadFolderAssets(
                driveAccessToken,
                extractedId,
                (loaded, total) => setLoadProgress({ loaded, total })
            );
            setLoadProgress(null);
            onAssetsLoaded(loadedAssets);
            onDriveFolderUrlChange(inputValue);
        } catch (err) {
            console.error('Drive folder load error:', err);
            if (err instanceof DriveAuthError) {
                setError('Session expired. Please reconnect.');
            } else if (err instanceof DriveFolderError) {
                setError('Folder not found or you don\'t have access.');
            } else if (err instanceof Error) {
                setError(`Failed to load: ${err.message}`);
            } else {
                setError('Failed to load folder. Check the URL or ID.');
            }
        } finally {
            setLoading(false);
        }
    }, [inputValue, driveAccessToken, onAssetsLoaded, onDriveFolderUrlChange]);

    const handleReconnect = useCallback(async () => {
        try {
            await reconnectDrive();
            setError(null);
            // Auto-load is handled by the useEffect when driveAccessToken becomes available
        } catch {
            setError('Failed to connect. Please try again.');
        }
    }, [reconnectDrive]);

    // Auto-load when token becomes available and we have a pending load or pre-populated URL
    useEffect(() => {
        if (driveAccessToken && inputValue.trim() && !loading && assets.length === 0) {
            // Clear pending and auto-load
            if (pendingLoad) {
                setPendingLoad(false);
            }
            // Small delay to ensure token is fully available
            const timer = setTimeout(() => {
                handleLoadFolder();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [driveAccessToken, inputValue, loading, assets.length, pendingLoad, handleLoadFolder]);

    // Filter assets by search query
    const filteredAssets = assets.filter(asset =>
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.originalName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const needsReconnect = !driveAccessToken || error?.includes('reconnect') || error?.includes('expired');
    const hasAssets = assets.length > 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header with folder config */}
            <div className="flex-shrink-0 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)]">
                <div className="p-4 space-y-3">
                    {/* Folder URL Input Row */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 min-w-fit">
                            <div className={`p-2 rounded-lg ${hasAssets ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
                                <HardDrive className={`w-5 h-5 ${hasAssets ? 'text-emerald-400' : 'text-amber-400'}`} />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm text-[var(--text-primary)]">Campaign Assets</span>
                                <span className="text-[10px] text-[var(--text-muted)]">Google Drive Folder</span>
                            </div>
                        </div>

                        {/* Input field */}
                        <div className="relative flex-1 max-w-xl">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                <Link2 className="w-4 h-4 text-[var(--text-muted)]" />
                            </div>
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    setError(null);
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && !loading && handleLoadFolder()}
                                placeholder="Paste Google Drive folder URL..."
                                className={`w-full pl-10 pr-4 py-2.5 text-sm bg-[var(--bg-primary)] border rounded-lg focus:outline-none transition-colors ${error
                                    ? 'border-red-500/50 focus:border-red-500'
                                    : hasAssets
                                        ? 'border-emerald-500/30 focus:border-emerald-500'
                                        : 'border-[var(--border-primary)] focus:border-amber-500'
                                    }`}
                            />
                        </div>

                        {/* Action button */}
                        {needsReconnect ? (
                            <button
                                onClick={handleReconnect}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Connect Drive
                            </button>
                        ) : (
                            <button
                                onClick={handleLoadFolder}
                                disabled={loading || !inputValue.trim()}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {loadProgress
                                            ? `${loadProgress.loaded}/${loadProgress.total}`
                                            : 'Loading...'}
                                    </>
                                ) : hasAssets ? (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Reload
                                    </>
                                ) : (
                                    <>
                                        <FolderOpen className="w-4 h-4" />
                                        Load Assets
                                    </>
                                )}
                            </button>
                        )}

                        {/* Status badge */}
                        {hasAssets && !loading && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
                                <Check className="w-4 h-4 text-emerald-400" />
                                <span className="text-sm font-medium text-emerald-400">{assets.length} assets</span>
                            </div>
                        )}
                    </div>

                    {/* Error display */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg"
                            >
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Search bar (only when assets loaded) */}
                    {hasAssets && (
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search assets..."
                                className="w-full max-w-md pl-10 pr-4 py-2 text-sm bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg focus:outline-none focus:border-amber-500"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Asset Grid */}
            <div className="flex-1 overflow-auto p-4">
                {!hasAssets ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                        {needsReconnect ? (
                            <>
                                <HardDrive className="w-16 h-16 mb-4 opacity-30" />
                                <p className="text-lg font-medium mb-2">Connect Google Drive</p>
                                <p className="text-sm text-center max-w-md mb-4">
                                    Click the <span className="text-amber-400 font-medium">Connect Drive</span> button above to authorize access to your Google Drive folders
                                </p>
                                <p className="text-xs text-[var(--text-muted)] opacity-60">
                                    This is a one-time authorization per session
                                </p>
                            </>
                        ) : (
                            <>
                                <HardDrive className="w-16 h-16 mb-4 opacity-30" />
                                <p className="text-lg font-medium mb-2">No assets loaded</p>
                                <p className="text-sm">Paste a Google Drive folder URL above to load assets for this campaign</p>
                            </>
                        )}
                    </div>
                ) : filteredAssets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
                        <Search className="w-12 h-12 mb-3 opacity-30" />
                        <p className="text-base font-medium">No matching assets</p>
                        <p className="text-sm">Try a different search term</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {filteredAssets.map((asset) => (
                            <VideoHoverCard
                                key={asset.id}
                                asset={asset}
                                driveAccessToken={driveAccessToken}
                            />

                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Asset card with hover-to-preview for videos */
function VideoHoverCard({ asset, driveAccessToken }: { asset: Asset; driveAccessToken: string | null }) {
    const [isHovering, setIsHovering] = useState(false);
    const isVideo = asset.type === 'video';
    const canPreview = isVideo && !!asset.driveFileId && !!driveAccessToken;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="group relative aspect-square rounded-lg overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-primary)] hover:border-amber-500/50 transition-colors cursor-pointer"
            onMouseEnter={() => canPreview && setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            {/* Video preview on hover */}
            {isHovering && canPreview ? (
                <video
                    src={`/api/video-proxy?fileId=${asset.driveFileId}`}
                    autoPlay
                    muted
                    playsInline
                    loop
                    className="w-full h-full object-cover"
                />
            ) : (asset.permanentThumbnailUrl || asset.cachedThumbnail) ? (
                <img
                    src={asset.permanentThumbnailUrl || asset.cachedThumbnail}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--bg-tertiary)]">
                    {isVideo ? (
                        <Film className="w-10 h-10 text-[var(--text-muted)]" />
                    ) : (
                        <ImageIcon className="w-10 h-10 text-[var(--text-muted)]" />
                    )}
                </div>
            )}

            {/* Play icon for videos (visible on hover before video loads) */}
            {isVideo && !isHovering && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 text-black ml-0.5" />
                    </div>
                </div>
            )}

            {/* Badge row: Type + Orientation */}
            <div className="absolute top-2 left-2 flex gap-1">
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isVideo ? 'bg-purple-500/80' : 'bg-blue-500/80'} text-white`}>
                    {asset.type}
                </div>
                {asset.dimensions && (
                    <div className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/60 text-white">
                        {shapeLabel(asset.dimensions)}
                    </div>
                )}
            </div>

            {/* Duration badge for videos */}
            {isVideo && asset.duration && !isHovering && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-black/70 text-white">
                    {Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, '0')}
                </span>
            )}

            {/* Name overlay on hover */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-xs text-white truncate">{asset.name}</p>
            </div>
        </motion.div>
    );
}
