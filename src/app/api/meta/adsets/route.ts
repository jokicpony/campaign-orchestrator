/**
 * API Route: Get ad sets for a specific campaign
 * Used by Publish Wizard to select existing ad sets
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { getAdSets, isMetaTokenError } from '@/lib/meta/client';
import { logger, serializeError } from '@/lib/logger';

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const { campaignId } = body;

        if (!campaignId) {
            return NextResponse.json(
                { error: 'Missing campaign ID' },
                { status: 400 }
            );
        }

        // Fetch ad sets from Meta
        const adSets = await getAdSets(accessToken, campaignId);

        return NextResponse.json({
            success: true,
            adSets,
            count: adSets.length,
        });
    } catch (error) {
        logger.error('meta', 'Failed to fetch ad sets', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';

        if (isMetaTokenError(error)) {
            return NextResponse.json(
                { error: 'Meta token expired. Please reconnect your account.', code: 'TOKEN_EXPIRED' },
                { status: 401 }
            );
        }

        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
