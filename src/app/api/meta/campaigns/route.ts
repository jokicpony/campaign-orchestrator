/**
 * API Route: Get campaigns for the connected ad account
 * Used by Publish Wizard to select existing campaigns
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { getCampaigns, isMetaTokenError } from '@/lib/meta/client';
import { logger, serializeError } from '@/lib/logger';

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const { adAccountId } = body;

        if (!adAccountId) {
            return NextResponse.json(
                { error: 'Missing ad account ID' },
                { status: 400 }
            );
        }

        // Fetch campaigns from Meta
        const campaigns = await getCampaigns(accessToken, adAccountId);

        return NextResponse.json({
            success: true,
            campaigns,
            count: campaigns.length,
        });
    } catch (error) {
        logger.error('meta', 'Failed to fetch campaigns', { error: serializeError(error) });
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
