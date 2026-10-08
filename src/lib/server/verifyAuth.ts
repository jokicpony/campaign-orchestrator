import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Server-side Firebase ID token verification.
 *
 * Verifies the `Authorization: Bearer <idToken>` header against Google's
 * public signing keys — no Admin SDK or service account needed. Every API
 * route that proxies a paid upstream (Meta, Drive, AI providers) must call
 * this; without it the routes are an open proxy for anonymous internet
 * traffic.
 */

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

// Google rotates these keys; createRemoteJWKSet caches and refetches as needed.
const JWKS = createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface AuthedUser {
    uid: string;
    email?: string;
    emailVerified?: boolean;
}

// Optional org allowlist. Firebase auth alone admits anyone with a Google
// account in this Firebase project; set one or both of these to restrict the
// API to your team:
//   AUTHORIZED_EMAILS="alice@x.com,bob@y.com"
//   AUTHORIZED_EMAIL_DOMAINS="yourcompany.com"
// Unset = DENIED in production (allowed in dev) unless ALLOW_ALL_AUTHENTICATED=true.
const ALLOWED_EMAILS = new Set(
    (process.env.AUTHORIZED_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
);
const ALLOWED_DOMAINS = (process.env.AUTHORIZED_EMAIL_DOMAINS || '')
    .split(',')
    .map(d => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);

// With no allowlist configured, Firebase auth alone admits ANY Google account
// that can sign into this project — fine for local dev, but an open, billable
// proxy in production. So an empty allowlist fails CLOSED in production unless
// the operator explicitly opts out with ALLOW_ALL_AUTHENTICATED=true.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ALLOW_ALL_AUTHENTICATED = process.env.ALLOW_ALL_AUTHENTICATED === 'true';

function isAllowed(user: AuthedUser): boolean {
    if (ALLOWED_EMAILS.size === 0 && ALLOWED_DOMAINS.length === 0) {
        // No allowlist set: deny in production (unless explicitly opted out);
        // allow in dev so local work isn't blocked.
        return !IS_PRODUCTION || ALLOW_ALL_AUTHENTICATED;
    }
    // Unverified emails can be registered by anyone (e.g. via the
    // email/password provider) — never match them against the allowlist
    if (!user.email || !user.emailVerified) return false;
    const normalized = user.email.toLowerCase();
    if (ALLOWED_EMAILS.has(normalized)) return true;
    const domain = normalized.split('@')[1] || '';
    return ALLOWED_DOMAINS.includes(domain);
}

/**
 * Returns the authenticated user, or null if the request carries no valid
 * Firebase ID token.
 */
let warnedMissingProjectId = false;

export async function getAuthedUser(request: NextRequest): Promise<AuthedUser | null> {
    if (!FIREBASE_PROJECT_ID) {
        // Fail closed, but say WHY: without this log a deploy missing only
        // this var looks like a healthy app whose every API call 401s.
        if (!warnedMissingProjectId) {
            warnedMissingProjectId = true;
            console.error(
                '[auth] NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set — token ' +
                    'verification is impossible, so ALL API requests will be ' +
                    'rejected with 401. Set it (see .env.example) and redeploy.'
            );
        }
        return null;
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    try {
        const { payload } = await jwtVerify(authHeader.slice(7), JWKS, {
            issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
            audience: FIREBASE_PROJECT_ID,
        });
        if (!payload.sub) return null;
        return {
            uid: payload.sub,
            email: typeof payload.email === 'string' ? payload.email : undefined,
            emailVerified: payload.email_verified === true,
        };
    } catch {
        return null;
    }
}

/**
 * Guard for route handlers. Usage:
 *
 *   const auth = await requireAuth(request);
 *   if (auth instanceof NextResponse) return auth; // 401
 *   // auth.uid is the verified Firebase user id
 */
export async function requireAuth(request: NextRequest): Promise<AuthedUser | NextResponse> {
    const user = await getAuthedUser(request);
    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized — sign in and retry', code: 'UNAUTHENTICATED' },
            { status: 401 }
        );
    }
    if (!isAllowed(user)) {
        return NextResponse.json(
            { error: 'This account is not authorized for this workspace', code: 'FORBIDDEN' },
            { status: 403 }
        );
    }
    return user;
}
