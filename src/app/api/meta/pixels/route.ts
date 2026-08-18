/**
 * API Route: Get pixels for an ad account
 * Used by PublishWizard to select a pixel for conversion campaigns
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

        const body = await request.json();
        const { adAccountId } = body;

        if (!adAccountId) {
            logger.error('pixels', 'Missing ad account ID in request');
            return NextResponse.json(
                { error: 'Missing ad account ID' },
                { status: 400 }
            );
        }

        logger.info('pixels', 'Fetching pixels', {
            adAccountId,
            hasActPrefix: adAccountId.startsWith('act_'),
        });

        // Fetch pixels from Meta
        const url = `${GRAPH_API_BASE}/${adAccountId}/adspixels?fields=id,name,is_unavailable,last_fired_time`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            logger.error('pixels', 'Meta API rejected pixel request', {
                httpStatus: response.status,
                errorMessage: result.error?.message,
                errorType: result.error?.type,
                errorCode: result.error?.code,
                errorSubcode: result.error?.error_subcode,
                fbtraceId: result.error?.fbtrace_id,
                adAccountId,
            });
            return NextResponse.json(
                {
                    error: result.error?.message || 'Failed to fetch pixels',
                    errorCode: result.error?.code,
                    errorSubcode: result.error?.error_subcode,
                    errorType: result.error?.type,
                    fbtraceId: result.error?.fbtrace_id,
                },
                { status: 400 }
            );
        }

        // Filter out unavailable pixels and format response
        interface PixelData {
            id: string;
            name: string;
            is_unavailable?: boolean;
            last_fired_time?: string;
        }
        const pixels = ((result.data || []) as PixelData[])
            .filter((p) => !p.is_unavailable)
            .map((p) => ({
                id: p.id,
                name: p.name,
                lastFiredTime: p.last_fired_time,
            }));

        logger.info('pixels', `Found ${pixels.length} available pixels`);

        return NextResponse.json({
            success: true,
            pixels,
            count: pixels.length,
        });
    } catch (error) {
        logger.error('pixels', 'Fetch error', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
