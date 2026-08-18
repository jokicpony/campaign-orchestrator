'use client';

import { useEffect, useRef } from 'react';
import { Campaign } from '@/types';
import { getCachedThumbnailUrl } from '@/lib/firebase/thumbnailCache';

/**
 * Resolves permanent thumbnail URLs for row assets that are missing them.
 * 
 * This handles the case where:
 * - Assets were assigned to rows before the thumbnail cache was built
 * - The old cachedThumbnail (base64) was stripped from Firestore
 * - The old thumbnailUrl (Drive) has expired
 * - But the thumbnail IS in Firebase Storage (just not linked yet)
 * 
 * Runs once per campaign load, patches assets, and saves back to Firestore.
 */
export function useThumbnailResolver(
    campaign: Campaign | null,
    onUpdate: (updates: Partial<Campaign>) => void
) {
    const resolvedCampaignId = useRef<string | null>(null);

    useEffect(() => {
        if (!campaign?.id || !campaign.rows?.length) return;

        // Only resolve once per campaign load
        if (resolvedCampaignId.current === campaign.id) return;
        resolvedCampaignId.current = campaign.id;

        (async () => {
            let hasUpdates = false;
            const updatedRows = await Promise.all(
                campaign.rows.map(async (row) => {
                    if (!row.assets?.length) return row;

                    const updatedAssets = await Promise.all(
                        row.assets.map(async (asset) => {
                            // Skip if already has a permanent URL
                            if (asset.permanentThumbnailUrl) return asset;

                            // Skip if no driveFileId to look up
                            if (!asset.driveFileId) return asset;

                            // Check Firebase Storage for a cached thumbnail
                            const permanentUrl = await getCachedThumbnailUrl(asset.driveFileId);
                            if (permanentUrl) {
                                hasUpdates = true;
                                return { ...asset, permanentThumbnailUrl: permanentUrl };
                            }

                            return asset;
                        })
                    );

                    return { ...row, assets: updatedAssets };
                })
            );

            if (hasUpdates) {
                onUpdate({ rows: updatedRows });
            }
        })();
    }, [campaign?.id, campaign?.rows, onUpdate]);
}
