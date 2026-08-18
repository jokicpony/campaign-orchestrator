import { NextRequest, NextResponse } from 'next/server';
import { exchangeForLongLivedToken, getUserInfo, getAdAccounts, getPages, getInstagramAccounts } from '@/lib/meta/client';
import { GRAPH_API_BASE } from '@/lib/meta/constants';
import { setMetaToken } from '@/lib/server/metaTokenStore';
import { logger, serializeError } from '@/lib/logger';

const STATE_COOKIE = 'meta_oauth_state';
const UID_COOKIE = 'meta_oauth_uid';

/** Redirect back to the app with an error message and clear the state cookie. */
function errorRedirect(request: NextRequest, message: string): NextResponse {
    const response = NextResponse.redirect(
        new URL(`/?meta_error=${encodeURIComponent(message)}`, request.url)
    );
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(UID_COOKIE);
    return response;
}

/**
 * Handles Meta OAuth callback
 *
 * 1. Validates the CSRF state against the cookie set when the flow started
 * 2. Exchanges auth code for short-lived token
 * 3. Exchanges short-lived for long-lived token
 * 4. Fetches user info and ad accounts
 * 5. Returns data to the client in the URL *fragment* (never sent to servers,
 *    proxies, or logs) to be stored in Firestore by the client
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
        logger.error('auth', 'Meta OAuth error', { error, errorDescription });
        return errorRedirect(request, errorDescription || error);
    }

    // CSRF check: state from Facebook must match the cookie we set
    const returnedState = searchParams.get('state');
    const expectedState = request.cookies.get(STATE_COOKIE)?.value;
    if (!returnedState || !expectedState || returnedState !== expectedState) {
        logger.error('auth', 'Meta OAuth state mismatch — possible CSRF', {
            hasReturnedState: !!returnedState,
            hasCookie: !!expectedState,
        });
        return errorRedirect(request, 'Sign-in session expired or invalid. Please try connecting again.');
    }

    if (!code) {
        return errorRedirect(request, 'No authorization code received');
    }

    // The uid was stashed (httpOnly) when the flow started, so the token can be
    // stored server-side under the right user without ever touching the browser.
    const uid = request.cookies.get(UID_COOKIE)?.value;
    if (!uid) {
        return errorRedirect(request, 'Sign-in session expired. Please try connecting again.');
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI ||
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/meta/callback`;

    if (!appId || !appSecret) {
        logger.error('auth', 'Meta credentials not configured');
        return errorRedirect(request, 'Server configuration error');
    }

    try {
        // Step 1: Exchange code for short-lived token
        const tokenUrl = new URL(`${GRAPH_API_BASE}/oauth/access_token`);
        tokenUrl.searchParams.set('client_id', appId);
        tokenUrl.searchParams.set('client_secret', appSecret);
        tokenUrl.searchParams.set('redirect_uri', redirectUri);
        tokenUrl.searchParams.set('code', code);

        const tokenResponse = await fetch(tokenUrl.toString());
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            logger.error('auth', 'Token exchange error', { error: tokenData.error });
            throw new Error(tokenData.error.message || 'Failed to exchange token');
        }

        const shortLivedToken = tokenData.access_token;

        // Step 2: Exchange for long-lived token
        const longLivedTokenData = await exchangeForLongLivedToken(
            shortLivedToken,
            appId,
            appSecret
        );

        const accessToken = longLivedTokenData.access_token;
        // Long-lived tokens typically last ~60 days
        const expiresIn = longLivedTokenData.expires_in || 60 * 24 * 60 * 60; // 60 days default
        const expiresAt = new Date(Date.now() + expiresIn * 1000);

        // Step 3: Get user info
        const userInfo = await getUserInfo(accessToken);

        // Step 4: Get ad accounts
        const adAccounts = await getAdAccounts(accessToken);

        // Step 5: Get Facebook Pages (for ad publishing)
        const pages = await getPages(accessToken);

        // Step 6: Get Instagram accounts from the ad account (correct IDs for Marketing API)
        // The Pages API instagram_business_account.id returns a Graph node ID that doesn't
        // work with the Marketing API. The ad account endpoint returns the actual IG actor IDs.
        const selectedAdAccountId = adAccounts.length > 0 ? adAccounts[0].id : null;
        if (selectedAdAccountId) {
            const igAccounts = await getInstagramAccounts(accessToken, selectedAdAccountId);
            if (igAccounts.length > 0) {
                const igActorId = igAccounts[0].id;
                logger.info('auth', 'Found Instagram account from ad account endpoint', {
                    igActorId,
                    username: igAccounts[0].username,
                    pagesIgId: pages[0]?.instagramAccountId || '(none)',
                });
                // Override the Pages API value with the correct ad account IG actor ID
                pages.forEach(page => {
                    if (page.instagramAccountId) {
                        page.instagramAccountId = igActorId;
                    }
                });
            }
        }

        // Store the long-lived token server-side — it is never sent to the
        // browser, never written to a client-readable doc, never in a request body.
        await setMetaToken(uid, accessToken, expiresAt.toISOString());

        // Non-secret connection metadata for the client UI — no token here.
        const connectionData = {
            tokenExpiresAt: expiresAt.toISOString(),
            userId: userInfo.id,
            userName: userInfo.name,
            adAccounts,
            selectedAdAccountId,
            pages,
            selectedPageId: pages.length > 0 ? pages[0].id : null,
            connectedAt: new Date().toISOString(),
        };

        // Send the payload in the URL fragment: fragments are never transmitted
        // to servers, never appear in access logs, and aren't sent in Referer
        // headers — unlike query params, which would expose the access token.
        const encodedData = encodeURIComponent(JSON.stringify(connectionData));
        const response = NextResponse.redirect(
            new URL(`/?meta_connected=true#meta_data=${encodedData}`, request.url)
        );
        response.cookies.delete(STATE_COOKIE);
        response.cookies.delete(UID_COOKIE);
        return response;

    } catch (error) {
        // Log the detail (may include Firestore/STS internals); show the user a
        // generic message rather than reflecting raw error text into the URL.
        logger.error('auth', 'Meta OAuth callback error', { error: serializeError(error) });
        return errorRedirect(request, 'Something went wrong connecting Meta. Please try again.');
    }
}
