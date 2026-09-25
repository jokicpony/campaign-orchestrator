import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/server/verifyAuth';
import { deleteMetaToken } from '@/lib/server/metaTokenStore';
import { FACEBOOK_OAUTH_DIALOG_BASE } from '@/lib/meta/constants';

const STATE_COOKIE = 'meta_oauth_state';
const UID_COOKIE = 'meta_oauth_uid';

/**
 * Initiates Meta OAuth (authenticated).
 *
 * The client calls this via authedFetch, so we can verify the Firebase user and
 * stash their uid in an httpOnly cookie. The callback reads it back to store the
 * resulting long-lived token server-side under that uid — the token itself never
 * travels through the browser. Returns { authUrl }; the client then navigates
 * the top-level window to it to start the Facebook dialog.
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const redirectUri = process.env.META_REDIRECT_URI ||
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/meta/callback`;

    if (!appId) {
        return NextResponse.json({ error: 'Meta App ID not configured' }, { status: 500 });
    }

    // Required scopes for Marketing API access
    const scopes = [
        'ads_read',              // Read ad insights and data
        'ads_management',        // Create/manage ads
        'business_management',   // Access Business Manager and ad accounts
        'pages_read_engagement', // Access Facebook Pages for ad publishing
        'pages_show_list',       // List the user's Pages (/me/accounts) — a required dependency of the above
    ].join(',');

    // CSRF protection: random state, echoed back by Facebook and checked
    // against the state cookie in the callback.
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL(FACEBOOK_OAUTH_DIALOG_BASE);
    authUrl.searchParams.set('client_id', appId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    const response = NextResponse.json({ authUrl: authUrl.toString() });
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 600, // 10 minutes to complete the Facebook dialog
        path: '/',
    };
    response.cookies.set(STATE_COOKIE, state, cookieOptions);
    response.cookies.set(UID_COOKIE, authed.uid, cookieOptions);
    return response;
}

/**
 * Disconnect: revoke the server-side Meta token for the signed-in user, so
 * "Disconnect" actually invalidates the credential instead of leaving a live
 * 60-day token in the store. The client also clears its local metadata.
 */
export async function DELETE(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        await deleteMetaToken(authed.uid);
    } catch {
        return NextResponse.json({ success: false }, { status: 503 });
    }
    return NextResponse.json({ success: true });
}
