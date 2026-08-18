/**
 * API Route: Create a new Meta Campaign
 * Used by PublishWizard for "New Campaign" flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { logger, serializeError, serializeMetaError } from '@/lib/logger';

import { GRAPH_API_BASE } from '@/lib/meta/constants';

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const {
            adAccountId,
            name,
            objective = 'OUTCOME_SALES',
            specialAdCategories = [],
            campaignType = 'STANDARD', // 'ASC' or 'STANDARD'
            budgetLevel = 'adset', // 'campaign' = CBO, 'adset' = ad set level
            dailyBudget, // In dollars, only used when budgetLevel === 'campaign'
        } = body;

        // Validate required fields
        if (!adAccountId) {
            return NextResponse.json(
                { error: 'adAccountId is required' },
                { status: 400 }
            );
        }

        if (!name) {
            return NextResponse.json(
                { error: 'Campaign name is required' },
                { status: 400 }
            );
        }

        logger.info('campaign', 'Creating campaign', { name, objective, campaignType, budgetLevel, dailyBudget, adAccountId });

        // Build campaign payload.
        // ASC note: we intentionally do NOT set `smart_promotion_type`. Meta
        // deprecated the legacy Advantage+ Shopping creation flag (Oct 2025) and
        // removes ASC/AAC creation entirely in Marketing API v25.0 (Q1 2026); the
        // unified model derives Advantage+ state from automation settings, not a
        // creation flag. The "ASC" toggle therefore creates a standard
        // OUTCOME_SALES campaign — which is what has been publishing successfully.
        // See docs/meta-campaign-api-notes.md.
        const campaignPayload: Record<string, string> = {
            name,
            objective: campaignType === 'ASC' ? 'OUTCOME_SALES' : objective,
            status: 'PAUSED',
            buying_type: 'AUCTION',
        };

        // Campaign Budget Optimization (CBO)
        // CBO = daily_budget + bid_strategy on campaign; Meta distributes to ad sets
        // Ad set budget = no budget/bid on campaign, each ad set manages its own
        if (budgetLevel === 'campaign' && dailyBudget) {
            campaignPayload.daily_budget = Math.round(dailyBudget * 100).toString(); // dollars → cents
            campaignPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
        } else {
            // Non-CBO: Meta requires this field explicitly when not using campaign budget
            campaignPayload.is_adset_budget_sharing_enabled = 'false';
        }

        // Only add special_ad_categories if not empty
        if (specialAdCategories && specialAdCategories.length > 0) {
            campaignPayload.special_ad_categories = JSON.stringify(specialAdCategories);
        } else {
            campaignPayload.special_ad_categories = JSON.stringify([]);
        }

        // Create the campaign
        const params = new URLSearchParams(campaignPayload);
        params.append('access_token', accessToken);

        const requestUrl = `${GRAPH_API_BASE}/${adAccountId}/campaigns`;
        logger.debug('campaign', 'API request', { url: requestUrl, payload: campaignPayload });

        const response = await fetch(
            requestUrl,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            }
        );

        const result = await response.json();
        logger.debug('campaign', 'API response', { status: response.status, result });

        if (!response.ok || result.error) {
            logger.error('campaign', 'Creation failed', {
                status: response.status,
                metaError: serializeMetaError(result),
                payload: campaignPayload,
            });

            // Check for token expiration
            if (result.error?.code === 190) {
                return NextResponse.json(
                    { error: 'Meta access token expired', code: 'TOKEN_EXPIRED' },
                    { status: 401 }
                );
            }

            return NextResponse.json(
                {
                    error: result.error?.message || 'Failed to create campaign',
                    errorType: result.error?.type,
                    errorCode: result.error?.code,
                    fullResponse: result,
                },
                { status: 400 }
            );
        }

        logger.info('campaign', 'Created successfully', { campaignId: result.id, name });

        return NextResponse.json({
            success: true,
            campaignId: result.id,
            name,
        });

    } catch (error) {
        logger.error('campaign', 'Creation error', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
