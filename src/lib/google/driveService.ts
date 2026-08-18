import { Asset } from '@/types';
import { authedFetch } from '@/lib/api/authedFetch';
import { logger } from '@/lib/logger';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    thumbnailLink?: string;
    webContentLink?: string;
    imageMediaMetadata?: {
        width: number;
        height: number;
    };
    videoMediaMetadata?: {
        width: number;
        height: number;
        durationMillis: string;
    };
}

export interface DriveListResponse {
    files: DriveFile[];
    nextPageToken?: string;
}

/**
 * List files from a Google Drive folder
 * Supports both My Drive and Shared Drives (Team Drives)
 */
export async function listFolderContents(
    accessToken: string,
    folderId: string,
    pageToken?: string
): Promise<DriveListResponse> {
    const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
        fields: 'files(id,name,mimeType,thumbnailLink,webContentLink,imageMediaMetadata,videoMediaMetadata),nextPageToken',
        pageSize: '50',
        // Required for Shared Drive access
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
    });

    if (pageToken) {
        params.append('pageToken', pageToken);
    }

    const response = await fetch(`${DRIVE_API_BASE}/files?${params.toString()}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new DriveAuthError('Drive access token expired');
        }
        if (response.status === 404) {
            throw new DriveFolderError('Folder not found or access denied');
        }
        // Try to get more details from the error response
        try {
            const errorBody = await response.json();
            const errorMessage = errorBody?.error?.message || `Status ${response.status}`;
            throw new Error(`Drive API error: ${errorMessage}`);
        } catch {
            throw new Error(`Drive API error: ${response.status} ${response.statusText}`);
        }
    }

    return response.json();
}

/**
 * Convert Drive file metadata to Asset type
 */
export function driveFileToAsset(file: DriveFile): Asset {
    const isVideo = file.mimeType.startsWith('video/');

    return {
        id: `drive-${file.id}`,
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        originalName: file.name,
        // Use the original thumbnailLink from Drive API - it's from lh3.googleusercontent.com
        // and doesn't require auth, but can get rate-limited. Staggered loading in UI handles this.
        thumbnailUrl: file.thumbnailLink || '',
        fullUrl: `https://drive.google.com/file/d/${file.id}/view`,
        type: isVideo ? 'video' : 'image',
        driveFileId: file.id,
        dimensions: file.imageMediaMetadata
            ? {
                width: file.imageMediaMetadata.width,
                height: file.imageMediaMetadata.height,
            }
            : file.videoMediaMetadata
                ? {
                    width: file.videoMediaMetadata.width,
                    height: file.videoMediaMetadata.height,
                }
                : undefined,
        duration: file.videoMediaMetadata
            ? parseInt(file.videoMediaMetadata.durationMillis) / 1000
            : undefined,
    };
}

/**
 * Fetch a thumbnail and convert to base64 data URL
 * Uses our server-side proxy to avoid CORS issues with lh3.googleusercontent.com
 */
async function fetchThumbnailAsDataUrl(thumbnailLink: string): Promise<string | null> {
    try {
        // Use our proxy endpoint to avoid CORS issues
        const response = await authedFetch('/api/thumbnail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: thumbnailLink }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.data || null;
    } catch {
        return null;
    }
}

/**
 * Load all assets from a Drive folder with thumbnail caching.
 * 
 * For each asset:
 * 1. Check if a permanent thumbnail exists in Firebase Storage (instant)
 * 2. If cached → use permanent URL, skip Drive thumbnail fetch
 * 3. If not cached → fetch Drive thumbnail for immediate display,
 *    then cache to Storage in the background
 */
export async function loadFolderAssets(
    accessToken: string,
    folderId: string,
    onProgress?: (loaded: number, total: number) => void
): Promise<Asset[]> {
    // First, collect all file metadata
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
        const response = await listFolderContents(accessToken, folderId, pageToken);
        files.push(...response.files);
        pageToken = response.nextPageToken;
    } while (pageToken);

    // Import thumbnail cache lazily to avoid circular deps
    const { getOrCreateThumbnail, getCachedThumbnailUrl } = await import('@/lib/firebase/thumbnailCache');

    // Now, convert to assets and resolve thumbnails
    const assets: Asset[] = [];
    const uncachedAssets: { asset: Asset; file: DriveFile }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const asset = driveFileToAsset(file);

        // Check Firebase Storage cache first (fast — just a URL lookup)
        if (file.id) {
            const permanentUrl = await getCachedThumbnailUrl(file.id);
            if (permanentUrl) {
                asset.permanentThumbnailUrl = permanentUrl;
                // Skip slow Drive thumbnail fetch — we have a permanent one
                assets.push(asset);
                onProgress?.(i + 1, files.length);
                continue;
            }
        }

        // Not cached — fetch Drive thumbnail for immediate display
        if (file.thumbnailLink) {
            if (i > 0) {
                await new Promise(r => setTimeout(r, 100));
            }
            asset.cachedThumbnail = await fetchThumbnailAsDataUrl(file.thumbnailLink) || undefined;
        }

        assets.push(asset);
        uncachedAssets.push({ asset, file });
        onProgress?.(i + 1, files.length);
    }

    // Background: cache uncached thumbnails to Firebase Storage
    // This runs after the assets are returned, so UI loads fast
    if (uncachedAssets.length > 0) {
        (async () => {
            for (const { asset, file } of uncachedAssets) {
                if (!file.id) continue;
                try {
                    const permanentUrl = await getOrCreateThumbnail(
                        file.id,
                        accessToken,
                        asset.type
                    );
                    if (permanentUrl) {
                        asset.permanentThumbnailUrl = permanentUrl;
                    }
                } catch (err) {
                    logger.warn('drive', `Background thumbnail cache failed`, { fileId: file.id, error: String(err) });
                }
                // 200ms stagger to avoid overwhelming the server
                await new Promise(r => setTimeout(r, 200));
            }
        })();
    }

    return assets;
}

// Custom error types for better error handling
export class DriveAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DriveAuthError';
    }
}

export class DriveFolderError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DriveFolderError';
    }
}
