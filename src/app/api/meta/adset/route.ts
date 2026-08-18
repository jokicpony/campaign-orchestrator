/**
 * API Route: Create a new Meta Ad Set
 * Used by PublishWizard for "New Campaign" flow
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { requireMetaToken } from '@/lib/server/metaAuth';
import { logger, serializeError, serializeMetaError } from '@/lib/logger';

import { GRAPH_API_BASE } from '@/lib/meta/constants';
import { DEFAULT_AGE_MIN } from '@/lib/config/deployment';

/** Coerce an age to an integer within Meta's valid 13–65 targeting range. */
function clampAge(value: unknown, fallback: number): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(65, Math.max(13, n));
}

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const accessToken = await requireMetaToken(authed.uid);
        if (accessToken instanceof NextResponse) return accessToken;

        const body = await request.json();
        const {
            adAccountId,
            campaignId,
            name,
            dailyBudget, // In dollars — omitted when budgetLevel === 'campaign'
            optimizationGoal = 'OFFSITE_CONVERSIONS',
            billingEvent = 'IMPRESSIONS',
            countries = ['US'],
            isASC = false,
            pixelId, // Required for conversion-optimized campaigns
            conversionEvent = 'PURCHASE',
            budgetLevel = 'adset', // 'campaign' = CBO (no budget here), 'adset' = budget here
            useIncrementalAttribution = false, // Incremental attribution optimization
            pageId, // Facebook Page ID — used as promoted_object for non-conversion objectives
            objective, // Campaign objective — determines promoted_object type
            startTime, // ISO 8601 scheduled start date for the ad set
            specialAdCategories = [], // Credit/Employment/Housing — forbid age/gender targeting
            ageMin = DEFAULT_AGE_MIN, // Age floor (deployment default, see config/deployment.ts); omitted for special categories
            ageMax = 65,
        } = body;

        // Validate required fields
        if (!adAccountId || !campaignId) {
            return NextResponse.json(
                { error: 'adAccountId and campaignId are required' },
                { status: 400 }
            );
        }

        if (!name) {
            return NextResponse.json(
                { error: 'Ad Set name is required' },
                { status: 400 }
            );
        }

        // Validate pixelId for conversion optimization. OFFSITE_CONVERSIONS and
        // VALUE (ROAS) both require a pixel-based promoted_object.
        const needsPixel = optimizationGoal === 'OFFSITE_CONVERSIONS' || optimizationGoal === 'VALUE';
        if (needsPixel && !pixelId) {
            return NextResponse.json(
                { error: `pixelId is required for ${optimizationGoal} optimization` },
                { status: 400 }
            );
        }

        logger.info('adset', 'Creating ad set', { name, campaignId, dailyBudget, budgetLevel, optimizationGoal, pixelId, conversionEvent, startTime });

        // Build ad set payload
        const adSetPayload: Record<string, string> = {
            name,
            campaign_id: campaignId,
            billing_event: billingEvent,
            optimization_goal: optimizationGoal,
            status: 'PAUSED',
        };

        // Scheduled start time
        if (startTime) {
            adSetPayload.start_time = startTime;
        }

        // Only set budget on ad set when NOT using CBO
        if (budgetLevel === 'adset' && dailyBudget) {
            const budgetInCents = Math.round(dailyBudget * 100);
            adSetPayload.daily_budget = budgetInCents.toString();
        }

        // Incremental attribution optimization — only valid for Sales campaigns
        if (useIncrementalAttribution && objective === 'OUTCOME_SALES') {
            adSetPayload.is_incremental_attribution_enabled = 'true';
        }

        // Attribution spec — required for non-sales objectives
        // Awareness/Engagement: Meta only supports (1d_click, 0d_view) — no view-through
        if (objective === 'OUTCOME_AWARENESS' || objective === 'OUTCOME_ENGAGEMENT') {
            adSetPayload.attribution_spec = JSON.stringify([{
                event_type: 'CLICK_THROUGH',
                window_days: 1,
            }]);
        }

        // Add promoted_object — type depends on campaign objective
        if (pixelId && needsPixel) {
            // Sales/conversion campaigns (incl. VALUE/ROAS): pixel-based promoted object
            adSetPayload.promoted_object = JSON.stringify({
                pixel_id: pixelId,
                custom_event_type: conversionEvent || 'PURCHASE',
            });
        } else if (pageId && objective !== 'OUTCOME_SALES') {
            // Awareness/Traffic/Engagement campaigns: page-based promoted object
            adSetPayload.promoted_object = JSON.stringify({
                page_id: pageId,
            });
        }


        // Targeting. Special Ad Categories (Credit/Employment/Housing) FORBID age
        // and gender restrictions — Meta rejects the ad set if age_min/age_max are
        // present — so omit them there. Otherwise apply the configured age floor
        // (DEFAULT_AGE_MIN, see config/deployment.ts). ASC uses geo-only + floor;
        // Standard also sets an age ceiling.
        const hasSpecialCategory = Array.isArray(specialAdCategories) && specialAdCategories.length > 0;
        const targeting: Record<string, unknown> = { geo_locations: { countries } };
        if (!hasSpecialCategory) {
            // Sanitize bounds so a bad/missing value can't produce an invalid ad
            // set: clamp to Meta's 13–65 range and never let the floor exceed the
            // ceiling. Standard ad sets get both; ASC uses the floor only.
            const floor = clampAge(ageMin, DEFAULT_AGE_MIN);
            targeting.age_min = floor;
            if (!isASC) targeting.age_max = Math.max(floor, clampAge(ageMax, 65));
        }
        adSetPayload.targeting = JSON.stringify(targeting);

        // Bid strategy: only set at ad set level when NOT using CBO
        // Per Meta docs: "If you do not enable campaign budget optimization,
        // you should set bid_strategy at ad set level."
        if (budgetLevel === 'adset') {
            adSetPayload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
        }

        // Create the ad set
        const params = new URLSearchParams(adSetPayload);
        params.append('access_token', accessToken);

        logger.debug('adset', 'API request', { url: `${GRAPH_API_BASE}/${adAccountId}/adsets`, payload: adSetPayload, isASC });

        const response = await fetch(
            `${GRAPH_API_BASE}/${adAccountId}/adsets`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString(),
            }
        );

        const result = await response.json();

        logger.debug('adset', 'API response', { status: response.status, result });

        if (!response.ok || result.error) {
            logger.error('adset', 'Creation failed', {
                status: response.status,
                metaError: serializeMetaError(result),
                payload: adSetPayload,
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
                    error: result.error?.message || 'Failed to create ad set',
                    errorType: result.error?.type,
                    errorCode: result.error?.code,
                    fullResponse: result,
                },
                { status: 400 }
            );
        }

        logger.info('adset', 'Created successfully', { adSetId: result.id, name });

        return NextResponse.json({
            success: true,
            adSetId: result.id,
            name,
        });

    } catch (error) {
        logger.error('adset', 'Creation error', { error: serializeError(error) });
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
