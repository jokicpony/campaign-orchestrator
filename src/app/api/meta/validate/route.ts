/**
 * API Route: Validate Meta access token
 * Used by PublishWizard to verify token is still valid before publishing
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { logger, serializeError } from '@/lib/logger';

import { GRAPH_API_BASE } from '@/lib/meta/constants';

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        logger.info('auth', 'Validating Meta token');

        // Make a lightweight API call to verify token
        const response = await fetch(
            `${GRAPH_API_BASE}/me?fields=id,name`,
            {
                headers: { Authorization: `Bearer ${accessToken}` },
            }
        );

        const result = await response.json();

        if (!response.ok || result.error) {
            logger.warn('auth', 'Meta token validation failed', { error: result.error });

            // Check for specific error codes
            const errorCode = result.error?.code;
            const isExpired = errorCode === 190; // Token expired
            const isInvalid = errorCode === 102 || errorCode === 200; // Invalid token

            return NextResponse.json({
                valid: false,
                reason: isExpired ? 'Token expired' : isInvalid ? 'Invalid token' : 'Verification failed',
                errorCode,
            });
        }

        logger.info('auth', 'Meta token valid', { userId: result.id, userName: result.name });

        return NextResponse.json({
            valid: true,
            userId: result.id,
            userName: result.name,
        });
    } catch (error) {
        logger.error('auth', 'Meta token validation error', { error: serializeError(error) });
        return NextResponse.json(
            { valid: false, reason: 'Validation request failed' },
            { status: 500 }
        );
    }
}
