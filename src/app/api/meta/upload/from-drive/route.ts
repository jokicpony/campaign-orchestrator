import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { logger, serializeError } from '@/lib/logger';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
import { GRAPH_API_BASE } from '@/lib/meta/constants';

// Downloading up to 50MB from Drive and re-uploading to Meta can outlast the
// plan-default function window on slow transfers.
// (Vercel: values above 60s require a Pro plan; lower if deploying on Hobby.)
export const maxDuration = 300;

/**
 * Server-side proxy to download from Google Drive and upload to Meta
 * This avoids CORS issues since it's a server-to-server transfer
 * 
 * POST body: {
 *   googleAccessToken: string,  // Google OAuth token
 *   (Meta token: read server-side via requireMetaToken — never sent by the client)
 *   adAccountId: string,        // Meta ad account ID
 *   driveFileId: string,        // Google Drive file ID
 *   assetType: 'image' | 'video',
 *   fileName: string,
 * }
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const metaAccessToken = await requireMetaToken(authed.uid);
        if (metaAccessToken instanceof NextResponse) return metaAccessToken;

        const {
            googleAccessToken,
            adAccountId,
            driveFileId,
            assetType,
            fileName
        } = await request.json();

        if (!googleAccessToken || !adAccountId || !driveFileId || !assetType) {
            return NextResponse.json(
                { error: 'googleAccessToken, adAccountId, driveFileId, and assetType are required' },
                { status: 400 }
            );
        }

        // ── Transcode shortcut for large videos ──────────────────────────
        // If a Cloud Function is configured and this is a video, check file size
        // via Drive metadata (no download!) and route large files directly to the
        // Cloud Function. This avoids downloading 300MB into Next.js memory.
        const transcodeFunctionUrl = process.env.VIDEO_TRANSCODE_FUNCTION_URL;
        const TRANSCODE_THRESHOLD = 50 * 1024 * 1024; // 50 MB

        if (assetType === 'video' && transcodeFunctionUrl) {
            // Get file size from Drive metadata without downloading
            const metadataRes = await fetch(
                `${DRIVE_API_BASE}/files/${driveFileId}?fields=size&supportsAllDrives=true`,
                { headers: { Authorization: `Bearer ${googleAccessToken}` } },
            );

            if (metadataRes.ok) {
                const metadata = await metadataRes.json();
                const fileSize = parseInt(metadata.size || '0', 10);

                if (fileSize > TRANSCODE_THRESHOLD) {
                    // Large video → route to Cloud Function (it handles its own download)
                    logger.info('upload', 'Large video: routing to transcode function (skipping local download)', {
                        driveFileId, fileName, fileSize,
                    });

                    const apiKey = process.env.TRANSCODE_API_KEY || '';
                    const functionRes = await fetch(transcodeFunctionUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                        },
                        body: JSON.stringify({
                            googleAccessToken, metaAccessToken, adAccountId, driveFileId, fileName,
                        }),
                    });

                    const functionData = await functionRes.json();

                    if (!functionRes.ok || !functionData.success) {
                        logger.error('upload', 'Transcode function error', {
                            error: functionData.error, status: functionRes.status,
                        });
                        return NextResponse.json(
                            { error: functionData.error || 'Video transcoding failed' },
                            { status: functionRes.status || 500 }
                        );
                    }

                    logger.info('upload', 'Transcode + upload success', {
                        driveFileId, videoId: functionData.videoId,
                        originalSize: functionData.originalSize,
                        transcodedSize: functionData.transcodedSize,
                    });

                    return NextResponse.json({
                        success: true,
                        type: 'video',
                        videoId: functionData.videoId,
                        status: 'processing',
                    });
                }
            }
            // If metadata check fails or file is small, fall through to normal download path
        }

        // Step 1: Download file from Google Drive (images + small videos)
        logger.info('upload', `Downloading ${assetType} from Drive`, { driveFileId });

        const driveResponse = await fetch(
            `${DRIVE_API_BASE}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
            {
                headers: {
                    Authorization: `Bearer ${googleAccessToken}`,
                },
            }
        );

        if (!driveResponse.ok) {
            logger.error('upload', 'Drive download failed', { status: driveResponse.status });
            return NextResponse.json(
                { error: `Failed to download from Drive: ${driveResponse.status}` },
                { status: driveResponse.status }
            );
        }

        // Step 2: Read the file content and get the content type
        const contentType = driveResponse.headers.get('content-type') || 'application/octet-stream';
        const fileBuffer = await driveResponse.arrayBuffer();
        const base64Data = Buffer.from(fileBuffer).toString('base64');

        logger.info('upload', `Downloaded ${fileBuffer.byteLength} bytes, uploading to Meta`, { contentType });

        // Step 3: Upload to Meta
        if (assetType === 'image') {
            // Upload image to Meta
            const formData = new FormData();
            formData.append('bytes', base64Data);
            if (fileName) {
                formData.append('name', fileName);
            }

            const metaResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/adimages`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${metaAccessToken}` },
                    body: formData,
                }
            );

            const metaData = await metaResponse.json();

            if (!metaResponse.ok || metaData.error) {
                logger.error('upload', 'Meta image upload error', { error: metaData.error });
                return NextResponse.json(
                    { error: metaData.error?.message || 'Failed to upload image to Meta' },
                    { status: metaResponse.status || 500 }
                );
            }

            // Response format: { images: { [fileName]: { hash: string, ... } } }
            const images = metaData.images;
            const imageInfo = Object.values(images)[0] as { hash: string; url: string } | undefined;

            if (!imageInfo?.hash) {
                return NextResponse.json(
                    { error: 'No image hash returned from Meta' },
                    { status: 500 }
                );
            }

            logger.info('upload', 'Image transfer success', { driveFileId, hash: imageInfo.hash });

            return NextResponse.json({
                success: true,
                type: 'image',
                hash: imageInfo.hash,
                url: imageInfo.url,
            });
        } else {
            // ── Video Upload (small files only) ──────────────────────────
            // Large videos (>50MB) are handled above before the download step.
            // This path handles small videos via direct upload to Meta.
            const formData = new FormData();

            // Determine video MIME type: try content-type from Drive, then infer from filename
            let videoMimeType = 'video/mp4'; // default fallback

            if (contentType.startsWith('video/')) {
                videoMimeType = contentType;
            } else if (fileName) {
                const ext = fileName.toLowerCase().split('.').pop();
                const mimeMap: Record<string, string> = {
                    'mp4': 'video/mp4',
                    'mov': 'video/quicktime',
                    'avi': 'video/x-msvideo',
                    'wmv': 'video/x-ms-wmv',
                    'webm': 'video/webm',
                    'm4v': 'video/x-m4v',
                };
                if (ext && mimeMap[ext]) {
                    videoMimeType = mimeMap[ext];
                }
            }

            logger.debug('upload', 'Video direct upload (no transcode)', { contentType, inferred: videoMimeType, fileName });

            const blob = new Blob([Buffer.from(fileBuffer)], { type: videoMimeType });
            formData.append('source', blob, fileName || 'video.mp4');

            const metaResponse = await fetch(
                `${GRAPH_API_BASE}/${adAccountId}/advideos`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${metaAccessToken}` },
                    body: formData,
                }
            );

            const metaData = await metaResponse.json();

            if (!metaResponse.ok || metaData.error) {
                logger.error('upload', 'Meta video upload error', { error: metaData.error });
                return NextResponse.json(
                    { error: metaData.error?.message || 'Failed to upload video to Meta' },
                    { status: metaResponse.status || 500 }
                );
            }

            logger.info('upload', 'Video transfer success (direct)', { driveFileId, videoId: metaData.id });

            return NextResponse.json({
                success: true,
                type: 'video',
                videoId: metaData.id,
                status: 'processing',
            });
        }

    } catch (error) {
        logger.error('upload', 'Drive-to-Meta transfer error', { error: serializeError(error) });
        return NextResponse.json(
            { error: 'Failed to transfer file from Drive to Meta', details: String(error) },
            { status: 500 }
        );
    }
}
