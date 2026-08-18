'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Loader2, RefreshCw, AlertCircle, Check, Link2, HardDrive, ChevronRight } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { loadFolderAssets, DriveAuthError, DriveFolderError } from '@/lib/google';
import { Asset } from '@/types';

interface DriveFolderConfigProps {
    folderId?: string;
    onFolderIdChange: (folderId: string) => void;
    onAssetsLoaded: (assets: Asset[]) => void;
    loadedAssetsCount: number;
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

export function DriveFolderConfig({
    folderId,
    onFolderIdChange,
    onAssetsLoaded,
    loadedAssetsCount,
}: DriveFolderConfigProps) {
    const { driveAccessToken, reconnectDrive } = useAuth();

    const [inputValue, setInputValue] = useState(folderId || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync input with external folderId
    useEffect(() => {
        if (folderId && folderId !== inputValue) {
            setInputValue(folderId);
        }
    }, [folderId]);

    const handleLoadFolder = useCallback(async () => {
        const extractedId = extractFolderId(inputValue);

        if (!extractedId) {
            setError('Please enter a folder ID or URL');
            return;
        }

        if (!driveAccessToken) {
            // Don't show error - the UI already shows "Connect Drive" button
            // Just do nothing - user should click Connect first
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const assets = await loadFolderAssets(driveAccessToken, extractedId);
            onAssetsLoaded(assets);
            onFolderIdChange(extractedId);
        } catch (err) {
            if (err instanceof DriveAuthError) {
                setError('Session expired. Please reconnect.');
            } else if (err instanceof DriveFolderError) {
                setError('Folder not found or you don\'t have access.');
            } else {
                setError('Failed to load folder. Check the URL or ID.');
            }
        } finally {
            setLoading(false);
        }
    }, [inputValue, driveAccessToken, onAssetsLoaded, onFolderIdChange]);

    // Auto-load assets when Drive connects and we have a pre-populated URL
    useEffect(() => {
        if (driveAccessToken && inputValue.trim() && !loading && loadedAssetsCount === 0) {
            // Clear any errors and auto-load
            setError(null);
            // Small delay to ensure token is fully available
            const timer = setTimeout(() => {
                handleLoadFolder();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [driveAccessToken, inputValue, loading, loadedAssetsCount, handleLoadFolder]);

    const handleReconnect = useCallback(async () => {
        try {
            await reconnectDrive();
            setError(null);
            // Auto-load is handled by the useEffect above when driveAccessToken becomes available
        } catch {
            setError('Failed to connect. Please try again.');
        }
    }, [reconnectDrive]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !loading) {
            handleLoadFolder();
        }
    };

    const needsReconnect = !driveAccessToken || error?.includes('reconnect') || error?.includes('expired');
    const hasLoadedAssets = loadedAssetsCount > 0;

    return (
        <div className="border-b border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-background-secondary to-background-secondary relative">
            {/* Amber accent strip */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-600" />

            <div className="pl-5 pr-4 py-3">
                <div className="flex items-center gap-4">
                    {/* Section Header */}
                    <div className="flex items-center gap-3 min-w-fit">
                        <div className={`p-1.5 rounded-lg ${hasLoadedAssets ? 'bg-accent-success/15' : 'bg-amber-500/15'}`}>
                            <HardDrive className={`w-4 h-4 ${hasLoadedAssets ? 'text-accent-success' : 'text-amber-400'}`} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold text-sm text-foreground">Asset Library</span>
                            <span className="text-[10px] text-foreground-subtle">Google Drive</span>
                        </div>
                    </div>

                    {/* Divider */}
                    <ChevronRight className="w-4 h-4 text-foreground-subtle/30" />

                    {/* Input field */}
                    <div className="relative flex-1 max-w-lg">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Link2 className="w-3.5 h-3.5 text-foreground-subtle" />
                        </div>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Paste Drive folder URL or ID..."
                            className={`w-full pl-9 pr-3 py-2 text-sm bg-background border rounded-lg focus:outline-none transition-colors ${error
                                ? 'border-accent-error/50 focus:border-accent-error'
                                : hasLoadedAssets
                                    ? 'border-accent-success/30 focus:border-accent-success'
                                    : 'border-border focus:border-amber-500'
                                }`}
                        />
                    </div>

                    {/* Action button */}
                    {needsReconnect ? (
                        <button
                            onClick={handleReconnect}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors shadow-lg shadow-amber-500/20"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Connect Drive
                        </button>
                    ) : (
                        <button
                            onClick={handleLoadFolder}
                            disabled={loading || !inputValue.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading...
                                </>
                            ) : hasLoadedAssets ? (
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
                    <AnimatePresence>
                        {hasLoadedAssets && !loading && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-success/15 border border-accent-success/30"
                            >
                                <Check className="w-3.5 h-3.5 text-accent-success" />
                                <span className="text-sm font-medium text-accent-success">{loadedAssetsCount} assets ready</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Error display */}
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-1.5 text-sm text-accent-error"
                            >
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
