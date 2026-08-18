import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { logger, serializeError } from '@/lib/logger';

/**
 * POST /api/thumbnail
 * 
 * Fetches a thumbnail from an external URL and returns it as base64.
 * This avoids CORS issues when fetching from lh3.googleusercontent.com.
 * 
 * Body: { url: string }
 * Returns: { data: string } (base64 data URL)
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
        }

        // SSRF guard: only proxy Google-served thumbnail hosts. Without this,
        // the route is an open fetch proxy for arbitrary URLs.
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
        }
        const isAllowedHost = (u: URL): boolean =>
            u.protocol === 'https:' && (
                u.hostname.endsWith('.googleusercontent.com') ||
                u.hostname === 'drive.google.com'
            );

        if (!isAllowedHost(parsed)) {
            return NextResponse.json({ error: 'URL host not allowed' }, { status: 400 });
        }

        // Follow redirects MANUALLY so the host allowlist is re-checked on every
        // hop. A bare fetch() follows redirects automatically, so an allowed
        // Google host that 3xx-redirects off-domain would let this route read an
        // arbitrary/internal URL and hand the body back — an SSRF read primitive.
        const MAX_REDIRECTS = 3;
        const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
        let target = parsed.toString();
        let response: Response | null = null;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const r = await fetch(target, { redirect: 'manual' });
            if (r.status >= 300 && r.status < 400) {
                const location = r.headers.get('location');
                if (!location) break;
                let next: URL;
                try {
                    next = new URL(location, target);
                } catch {
                    return NextResponse.json({ error: 'Invalid redirect target' }, { status: 400 });
                }
                if (!isAllowedHost(next)) {
                    return NextResponse.json({ error: 'Redirect to a disallowed host' }, { status: 400 });
                }
                target = next.toString();
                continue;
            }
            response = r;
            break;
        }

        if (!response) {
            return NextResponse.json({ error: 'Too many redirects' }, { status: 502 });
        }
        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch: ${response.status}` },
                { status: response.status }
            );
        }

        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (declaredLength > MAX_BYTES) {
            return NextResponse.json({ error: 'Thumbnail too large' }, { status: 413 });
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_BYTES) {
            return NextResponse.json({ error: 'Thumbnail too large' }, { status: 413 });
        }
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        return NextResponse.json({ data: dataUrl });

    } catch (error) {
        logger.error('thumbnail', 'Proxy error', { error: serializeError(error) });
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
