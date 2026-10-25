import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { logger, serializeError } from '@/lib/logger';
import sharp from 'sharp';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const TARGET_SIZE = 800; // px on longest edge
const JPEG_QUALITY = 80;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024; // reject sources larger than 40 MB
const MAX_INPUT_PIXELS = 100_000_000; // sharp decompression-bomb guard (~100 MP)

/** True for SVG/XML (`<` after an optional BOM/whitespace) or gzip (.svgz). */
function looksLikeMarkup(buf: Buffer): boolean {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return true;
    let i = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? 3 : 0;
    while (i < buf.length && i < 1024 && (buf[i] === 0x20 || buf[i] === 0x09 || buf[i] === 0x0a || buf[i] === 0x0d)) i++;
    return buf[i] === 0x3c;
}

/**
 * POST /api/thumbnail-resize
 *
 * Downloads an asset from Google Drive and returns a resized JPEG thumbnail.
 * - Images: downloaded at full res, resized to 800px on longest edge, JPEG 80%
 * - Videos: uses Drive's thumbnail API at 800px (no ffmpeg needed)
 *
 * Body: { driveFileId, driveAccessToken, assetType: 'image' | 'video' }
 * Returns: JPEG image blob (image/jpeg)
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const { driveFileId, driveAccessToken, assetType } = await request.json();

        if (!driveFileId || !driveAccessToken) {
            return NextResponse.json(
                { error: 'driveFileId and driveAccessToken are required' },
                { status: 400 }
            );
        }

        let imageBuffer: Buffer;

        if (assetType === 'video') {
            // For videos, get the thumbnail URL from Drive API metadata
            const metaResponse = await fetch(
                `${DRIVE_API_BASE}/files/${driveFileId}?fields=thumbnailLink&supportsAllDrives=true`,
                {
                    headers: { Authorization: `Bearer ${driveAccessToken}` },
                }
            );

            if (!metaResponse.ok) {
                return NextResponse.json(
                    { error: `Failed to get video metadata: ${metaResponse.status}` },
                    { status: 500 }
                );
            }

            const meta = await metaResponse.json();
            if (!meta.thumbnailLink) {
                return NextResponse.json(
                    { error: 'No thumbnail available for this video' },
                    { status: 404 }
                );
            }

            // Drive thumbnails end with =s220 by default — replace with higher res
            const highResUrl = meta.thumbnailLink.replace(/=s\d+$/, `=s${TARGET_SIZE}`);
            const thumbResponse = await fetch(highResUrl);

            if (!thumbResponse.ok) {
                return NextResponse.json(
                    { error: `Failed to fetch video thumbnail: ${thumbResponse.status}` },
                    { status: 500 }
                );
            }

            imageBuffer = Buffer.from(await thumbResponse.arrayBuffer());
        } else {
            // For images, download the full file from Drive
            const driveResponse = await fetch(
                `${DRIVE_API_BASE}/files/${driveFileId}?alt=media&supportsAllDrives=true`,
                {
                    headers: { Authorization: `Bearer ${driveAccessToken}` },
                }
            );

            if (!driveResponse.ok) {
                return NextResponse.json(
                    { error: `Failed to download from Drive: ${driveResponse.status}` },
                    { status: driveResponse.status }
                );
            }

            const declaredLength = Number(driveResponse.headers.get('content-length') || 0);
            if (declaredLength > MAX_SOURCE_BYTES) {
                return NextResponse.json({ error: 'Source image too large' }, { status: 413 });
            }

            imageBuffer = Buffer.from(await driveResponse.arrayBuffer());
            if (imageBuffer.byteLength > MAX_SOURCE_BYTES) {
                return NextResponse.json({ error: 'Source image too large' }, { status: 413 });
            }
        }

        // Never hand SVG/XML to sharp: librsvg is its most exposed decoder
        // (CVE-2026-96889), and Meta can't use SVG creative anyway.
        if (looksLikeMarkup(imageBuffer)) {
            return NextResponse.json({ error: 'SVG images are not supported' }, { status: 415 });
        }

        // Resize with sharp — fit within TARGET_SIZE on longest edge
        const resized = await sharp(imageBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
            .resize(TARGET_SIZE, TARGET_SIZE, {
                fit: 'inside',         // Maintain aspect ratio, fit within bounds
                withoutEnlargement: true, // Don't upscale small images
            })
            .jpeg({ quality: JPEG_QUALITY })
            .toBuffer();

        // Return the resized JPEG as a binary response
        return new NextResponse(new Uint8Array(resized), {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Content-Length': resized.length.toString(),
            },
        });

    } catch (error) {
        logger.error('thumbnail', 'Resize error', { error: serializeError(error) });
        return NextResponse.json(
            { error: 'Failed to resize thumbnail', details: String(error) },
            { status: 500 }
        );
    }
}
