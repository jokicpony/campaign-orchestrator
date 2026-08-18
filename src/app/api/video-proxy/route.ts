import { NextRequest, NextResponse } from 'next/server';
import { logger, serializeError } from '@/lib/logger';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * GET /api/video-proxy?fileId=DRIVE_FILE_ID
 *
 * Streams video content from Google Drive for use in <video> elements.
 * Supports Range headers for seek/scrub.
 *
 * The credential is the path-scoped, SameSite=Strict `mco_drive_token` cookie
 * set by AuthContext — never a query param (query strings land in access logs).
 */
export async function GET(request: NextRequest) {
    try {
        // Consumed via <video src>, which can't carry an Authorization header.
        // The real credential is the mco_drive_token cookie, and it is
        // SameSite=Strict — so it is never sent on a cross-site request, and its
        // presence already proves the request is same-site. Sec-Fetch-Site is a
        // secondary guard against cross-site hotlinking: reject only when it is
        // PRESENT and cross-site. Failing closed on an ABSENT header would 403
        // legitimate playback on browsers that don't emit Sec-Fetch (e.g. older
        // Safari) while adding nothing the Strict cookie doesn't already enforce.
        const fetchSite = request.headers.get('sec-fetch-site');
        if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
            return NextResponse.json(
                { error: 'Cross-site requests are not allowed' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const fileId = searchParams.get('fileId');
        const token = request.cookies.get('mco_drive_token')?.value;

        if (!fileId || !token) {
            return NextResponse.json(
                { error: 'fileId and token are required' },
                { status: 400 }
            );
        }

        // First, get file metadata for content type and size
        const metaResponse = await fetch(
            `${DRIVE_API_BASE}/files/${fileId}?fields=mimeType,size&supportsAllDrives=true`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        if (!metaResponse.ok) {
            if (metaResponse.status === 401) {
                return NextResponse.json(
                    { error: 'Drive token expired' },
                    { status: 401 }
                );
            }
            return NextResponse.json(
                { error: `Drive API error: ${metaResponse.status}` },
                { status: metaResponse.status }
            );
        }

        const metadata = await metaResponse.json();
        const contentType = metadata.mimeType || 'video/mp4';
        const fileSize = parseInt(metadata.size || '0', 10);

        // Build headers for the Drive download request
        const driveHeaders: Record<string, string> = {
            Authorization: `Bearer ${token}`,
        };

        // Forward Range header for seeking support
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
            driveHeaders['Range'] = rangeHeader;
        }

        // Fetch actual video content
        const videoResponse = await fetch(
            `${DRIVE_API_BASE}/files/${fileId}?alt=media&supportsAllDrives=true`,
            { headers: driveHeaders }
        );

        if (!videoResponse.ok && videoResponse.status !== 206) {
            return NextResponse.json(
                { error: `Failed to stream video: ${videoResponse.status}` },
                { status: videoResponse.status }
            );
        }

        // Build response headers
        const responseHeaders: Record<string, string> = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600',
        };

        // For range requests, forward the content-range header
        const contentRange = videoResponse.headers.get('Content-Range');
        if (contentRange) {
            responseHeaders['Content-Range'] = contentRange;
        }

        const contentLength = videoResponse.headers.get('Content-Length');
        if (contentLength) {
            responseHeaders['Content-Length'] = contentLength;
        } else if (fileSize > 0 && !rangeHeader) {
            responseHeaders['Content-Length'] = fileSize.toString();
        }

        // Stream the response
        return new NextResponse(videoResponse.body, {
            status: videoResponse.status, // 200 or 206 for partial content
            headers: responseHeaders,
        });

    } catch (error) {
        logger.error('video', 'Proxy error', { error: serializeError(error) });
        return NextResponse.json(
            { error: 'Failed to proxy video' },
            { status: 500 }
        );
    }
}
