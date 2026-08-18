import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/verifyAuth';
import { getProviderKeys } from '@/lib/server/providerKeyStore';
import { logger, serializeError } from '@/lib/logger';
import { streamText, type LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { BrainConfig, PromptModifier, Product, CustomerPersona, GlobalPromptSettings, AIProvider, modelSupportsTemperature } from '@/types';
import { buildSystemPrompt, buildUserPrompt, buildIterationPrompt, buildCustomIterationPrompt, buildRemixPrompt, getAllModifiers } from '@/lib/ai/prompts';

// ─── Provider Router ─────────────────────────────────────────────
// Returns a Vercel AI SDK model instance based on provider + model ID.
// Key precedence: the user's OWN key (stored server-side, owner-only) → server
// env var fallback. Keys are never accepted from the client or a client-readable
// doc. See docs/SECURITY.md.

async function getModel(settings: GlobalPromptSettings | undefined, uid: string): Promise<LanguageModel> {
    const provider: AIProvider = settings?.aiProvider || 'google';
    const modelId = settings?.aiModel || 'gemini-2.5-flash';

    // The user's own key (owner-only server store) first, then the server env
    // var. A user can only affect their OWN key, so user-first is safe here.
    const userKeys = await getProviderKeys(uid);
    const envMap: Record<AIProvider, string | undefined> = {
        google: process.env.GEMINI_API_KEY,
        anthropic: process.env.ANTHROPIC_API_KEY,
        openai: process.env.OPENAI_API_KEY,
    };

    const apiKey = userKeys[provider] || envMap[provider];
    if (!apiKey) {
        throw new Error(`No API key configured for ${provider}. Add one in Settings → Brand Voice, or set the server env var (e.g. GEMINI_API_KEY).`);
    }

    switch (provider) {
        case 'google': {
            const google = createGoogleGenerativeAI({ apiKey });
            return google(modelId);
        }
        case 'anthropic': {
            const anthropic = createAnthropic({ apiKey });
            return anthropic(modelId);
        }
        case 'openai': {
            const openai = createOpenAI({ apiKey });
            return openai(modelId);
        }
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}

// ─── Request Types ───────────────────────────────────────────────

interface GenerateCopyRequest {
    action: 'generateCopy';
    config: BrainConfig;
    type: 'headline' | 'primary_text' | 'both';
    count: number;
    globalSettings?: GlobalPromptSettings;
    customModifiers?: PromptModifier[];
    product?: Product;
    persona?: CustomerPersona;
    previousGenerations?: string[];
}

interface GenerateIterationRequest {
    action: 'generateIteration';
    baseCopy: { text: string; type: 'headline' | 'primary_text' };
    modifier: PromptModifier;
    globalSettings?: GlobalPromptSettings;
    temperature?: number;
}

interface GenerateCustomIterationRequest {
    action: 'generateCustomIteration';
    baseCopy: { text: string; type: 'headline' | 'primary_text' };
    customDirection: string;
    globalSettings?: GlobalPromptSettings;
    temperature?: number;
}

interface GenerateRemixRequest {
    action: 'generateRemix';
    items: Array<{ text: string; type: 'headline' | 'primary_text' }>;
    globalSettings?: GlobalPromptSettings;
    count?: number;
    temperature?: number;
}

type GenerateRequest = GenerateCopyRequest | GenerateIterationRequest | GenerateCustomIterationRequest | GenerateRemixRequest;

// ─── POST Handler ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    try {
        const body: GenerateRequest = await request.json();

        if (body.action === 'generateCopy') {
            return await handleGenerateCopy(body, authed.uid);
        } else if (body.action === 'generateIteration') {
            return await handleGenerateIteration(body, authed.uid);
        } else if (body.action === 'generateCustomIteration') {
            return await handleGenerateCustomIteration(body, authed.uid);
        } else if (body.action === 'generateRemix') {
            return await handleGenerateRemix(body, authed.uid);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        logger.error('ai', 'Generate error', { error: serializeError(error) });
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Generation failed' },
            { status: 500 }
        );
    }
}

// ─── Shared streaming helper ─────────────────────────────────────

async function streamToSSE(
    model: LanguageModel,
    systemPrompt: string,
    userPrompt: string,
    temperature: number | undefined, // undefined => omit (model rejects temperature)
    maxOutputTokens: number
): Promise<Response> {
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start streaming in background (same pattern as original working code)
    (async () => {
        try {
            const result = streamText({
                model,
                system: systemPrompt,
                prompt: userPrompt,
                temperature,
                maxOutputTokens,
            });

            for await (const chunk of result.textStream) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
            }

            await writer.write(encoder.encode(`data: [DONE]\n\n`));
        } catch (error) {
            console.error('[AI Stream Error]', error);
            logger.error('ai', 'Stream error', { error: serializeError(error) });
            await writer.write(
                encoder.encode(`data: ${JSON.stringify({ error: 'Generation failed' })}\n\n`)
            );
        } finally {
            await writer.close();
        }
    })();

    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

// ─── Action Handlers ─────────────────────────────────────────────

// Omit temperature for models that reject it (e.g. Claude Sonnet 5 / Opus 4.8).
function tempFor(globalSettings: GlobalPromptSettings | undefined, temp: number): number | undefined {
    return modelSupportsTemperature(globalSettings?.aiModel) ? temp : undefined;
}

async function handleGenerateCopy(body: GenerateCopyRequest, uid: string): Promise<Response> {
    const { config, type, count, globalSettings, customModifiers = [], product, persona, previousGenerations } = body;

    const model = await getModel(globalSettings, uid);
    const allModifiers = getAllModifiers(customModifiers);
    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildUserPrompt(config, type, count, allModifiers, product, persona);

    let fullPrompt = userPrompt;
    if (previousGenerations && previousGenerations.length > 0) {
        fullPrompt = `PREVIOUS GENERATIONS (for variety, create NEW angles):\n${previousGenerations.slice(-5).join('\n')}\n\n---\n\n${userPrompt}\n\nIMPORTANT: Create fresh variations that differ from the previous generations listed above.`;
    }

    return streamToSSE(model, systemPrompt, fullPrompt, tempFor(globalSettings, config.temperature), 4096);
}

async function handleGenerateIteration(body: GenerateIterationRequest, uid: string): Promise<Response> {
    const { baseCopy, modifier, globalSettings, temperature } = body;

    const model = await getModel(globalSettings, uid);
    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildIterationPrompt(baseCopy, modifier, 3);

    return streamToSSE(model, systemPrompt, userPrompt, tempFor(globalSettings, temperature ?? 0.7), 1024);
}

async function handleGenerateCustomIteration(body: GenerateCustomIterationRequest, uid: string): Promise<Response> {
    const { baseCopy, customDirection, globalSettings, temperature } = body;

    const model = await getModel(globalSettings, uid);
    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildCustomIterationPrompt(baseCopy, customDirection, 3);

    return streamToSSE(model, systemPrompt, userPrompt, tempFor(globalSettings, temperature ?? 0.7), 1024);
}

async function handleGenerateRemix(body: GenerateRemixRequest, uid: string): Promise<Response> {
    const { items, globalSettings, count = 5, temperature } = body;

    const model = await getModel(globalSettings, uid);
    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildRemixPrompt(items, count);

    return streamToSSE(model, systemPrompt, userPrompt, tempFor(globalSettings, Math.min((temperature ?? 0.85) + 0.1, 1.0)), 2048);
}

// ─── GET: Check if any provider key is configured ────────────────

export async function GET(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    // Configured = a server env key OR this user's own stored key.
    const userKeys = await getProviderKeys(authed.uid).catch(() => ({} as Record<string, string>));
    const hasGemini = !!process.env.GEMINI_API_KEY || !!userKeys.google;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY || !!userKeys.anthropic;
    const hasOpenAI = !!process.env.OPENAI_API_KEY || !!userKeys.openai;
    return NextResponse.json({
        configured: hasGemini || hasAnthropic || hasOpenAI,
        providers: {
            google: hasGemini,
            anthropic: hasAnthropic,
            openai: hasOpenAI,
        },
    });
}
