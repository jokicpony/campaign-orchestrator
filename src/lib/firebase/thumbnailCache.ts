'use client';

import { getStorage, ref, uploadBytes, getDownloadURL, FirebaseStorage } from 'firebase/storage';
import { authedFetch } from '@/lib/api/authedFetch';
import { app } from './config';
import { logger } from '@/lib/logger';

// Lazy so firebase/storage stays out of the shared client chunk — this module
// is the only Storage consumer, and config.ts (imported app-wide via auth/db)
// shouldn't pay for it.
let storageClient: FirebaseStorage | null = null;
function storage(): FirebaseStorage {
    if (!storageClient) storageClient = getStorage(app);
    return storageClient;
}

/**
 * Check if a cached thumbnail exists in Firebase Storage and return its URL.
 * Returns null if not cached.
 */
export async function getCachedThumbnailUrl(driveFileId: string): Promise<string | null> {
    try {
        const thumbnailRef = ref(storage(), `thumbnails/${driveFileId}.jpg`);
        const url = await getDownloadURL(thumbnailRef);
        return url;
    } catch {
        // File doesn't exist or other error — not cached
        return null;
    }
}

/**
 * Upload a resized thumbnail to Firebase Storage and return the permanent URL.
 * The image should already be resized before calling this.
 */
export async function uploadCachedThumbnail(
    driveFileId: string,
    imageBlob: Blob
): Promise<string> {
    const thumbnailRef = ref(storage(), `thumbnails/${driveFileId}.jpg`);
    await uploadBytes(thumbnailRef, imageBlob, {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
    });
    return getDownloadURL(thumbnailRef);
}

/**
 * Get or create a cached thumbnail for a Drive file.
 * 1. Check Firebase Storage cache
 * 2. If not cached, call the resize API to download from Drive + resize
 * 3. Upload the resized image to Storage
 * 4. Return the permanent URL
 */
export async function getOrCreateThumbnail(
    driveFileId: string,
    driveAccessToken: string,
    assetType: 'image' | 'video'
): Promise<string | null> {
    // Check cache first
    const cached = await getCachedThumbnailUrl(driveFileId);
    if (cached) return cached;

    try {
        // Call server-side resize API
        const response = await authedFetch('/api/thumbnail-resize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driveFileId, driveAccessToken, assetType }),
        });

        if (!response.ok) {
            logger.warn('thumbnail', `Resize failed`, { driveFileId, status: response.status });
            return null;
        }

        // Get the resized image as a blob
        const blob = await response.blob();
        if (blob.size === 0) return null;

        // Upload to Firebase Storage
        const permanentUrl = await uploadCachedThumbnail(driveFileId, blob);
        return permanentUrl;
    } catch (err) {
        logger.warn('thumbnail', `Cache failed`, { driveFileId, error: String(err) });
        return null;
    }
}
