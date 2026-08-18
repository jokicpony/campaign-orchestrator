import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { getTopPerformers } from '@/lib/meta/client';
import { logger, serializeError } from '@/lib/logger';
import { MetaDatePreset } from '@/lib/meta/types';

/**
 * GET /api/meta/top-performers
 * 
 * Fetches top performing ads by spend from Meta Ads Manager
 * Requires Meta connection token from request headers or body
 */
export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const { adAccountId, datePreset, limit } = body;

        if (!adAccountId) {
            return NextResponse.json(
                { error: 'Missing ad account ID' },
                { status: 400 }
            );
        }

        const topPerformers = await getTopPerformers(accessToken, {
            adAccountId,
            datePreset: (datePreset || 'last_90d') as MetaDatePreset,
            limit: limit || 50,
            sortBy: 'spend',
        });

        return NextResponse.json({
            success: true,
            data: topPerformers,
            count: topPerformers.length,
        });

    } catch (error) {
        logger.error('meta', 'Top performers fetch error', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';

        // Check for token expiration
        if (message.includes('expired') || message.includes('invalid')) {
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
