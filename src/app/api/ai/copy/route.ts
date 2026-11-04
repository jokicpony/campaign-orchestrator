import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText, streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { requireAuth, type AuthedUser } from '@/lib/server/verifyAuth';
import { fetchPublicPage, PageFetchError } from '@/lib/server/safeFetch';
import { googleDirectUrl, GoogleLinkError, isGoogleSignIn, NOT_SHARED_MESSAGE } from '@/lib/server/googleLinks';
import { logger, serializeError } from '@/lib/logger';
import { htmlToPageText } from '@/lib/ai/pageText';
import {
    buildMessages, buildPageDigestPrompt, buildPdfDigestPrompt, buildSystemPrompt, KILL_LIST_MAX, KILL_TERM_MAX, MAX_TOP_COPY, MAX_TURNS, PAGE_CONDENSE_MIN, PAGE_READ_LIMIT,
    PAGE_TEXT_LIMIT, pageTextFor, SETTINGS_TEXT_MAX,
} from '@/lib/ai/prompts';
import { FALLBACK_GEMINI_MODEL, geminiModelId, pageModelId, thinkingOptionsFor } from '@/lib/ai/gemini';
import type { CopyContextPage } from '@/types/copywriter';
import { recordAiUsage } from '@/lib/server/aiUsage';

/**
 * The campaign copywriter. Gemini only, one team key (GEMINI_API_KEY in the
 * server env — never from the browser or Firestore).
 *
 *   POST { action: 'pages', urls }  → reads public pages, returns a context sheet each
 *   POST { action: 'write', … }     → streams copy as SSE ({chunk} … {usage} [DONE])
 *   GET                              → is a key set, which model, does it exist
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const short = (max: number) => z.string().max(max);

const pageSchema = z.object({
    url: short(2048),
    title: short(500),
    text: short(PAGE_TEXT_LIMIT + 100),
    fetchedAt: short(64),
    error: short(500).optional(),
    summarized: z.boolean().optional(),
});

/** One piece of copy: room for long-form reads (Meta takes up to 2,200 characters, Facebook-only copy can run longer). */
const COPY_TEXT_MAX = 8000;
/** One conversation turn: a Fill of several long-form stories plus headlines. */
const TURN_TEXT_MAX = 30000;

const winnerSchema = z.object({
    type: z.enum(['headline', 'primary_text']),
    text: short(COPY_TEXT_MAX),
    spend: z.number().optional(),
    ctr: z.number().optional(),
});

const writeSchema = z.object({
    action: z.literal('write'),
    brandVoice: short(SETTINGS_TEXT_MAX),
    targetPersonas: short(SETTINGS_TEXT_MAX),
    killList: z.array(short(KILL_TERM_MAX)).max(KILL_LIST_MAX),
    campaign: z.object({
        notes: short(10000),
        pages: z.array(pageSchema).max(10),
        topCopy: z.array(winnerSchema).max(MAX_TOP_COPY),
    }),
    turns: z.array(z.object({ role: z.enum(['user', 'assistant']), content: short(TURN_TEXT_MAX) })).max(MAX_TURNS * 2),
    row: z.object({
        label: short(200),
        adType: short(50).optional(),
        cardCount: z.number().int().min(0).max(10).optional(),
        callToAction: short(50).optional(),
        destinationUrl: short(2048).nullable().optional(),
        winners: z.array(winnerSchema).max(20),
        existing: z.array(z.object({ type: z.enum(['headline', 'primary_text']), text: short(COPY_TEXT_MAX) })).max(20),
        destinationPage: z.object({ title: short(500), text: short(PAGE_TEXT_LIMIT + 100) }).optional(),
    }),
    instruction: short(2000),
    /** What the ask was for, only to group Settings → Usage. */
    kind: z.enum(['write', 'fill', 'story']).optional(),
});

const pagesSchema = z.object({
    action: z.literal('pages'),
    urls: z.array(short(2048)).min(1).max(6),
});

function apiKey(): string | undefined {
    return process.env.GEMINI_API_KEY || undefined;
}

export async function POST(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const action = (body as { action?: string })?.action;

    if (action === 'pages') {
        const parsed = pagesSchema.safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        const pages = await Promise.all(parsed.data.urls.map(url => readPage(url, authed)));
        return NextResponse.json({ pages });
    }

    if (action === 'write') {
        const parsed = writeSchema.safeParse(body);
        if (!parsed.success) {
            const field = parsed.error.issues[0]?.path.join('.');
            return NextResponse.json({ error: field ? `Invalid request (${field})` : 'Invalid request' }, { status: 400 });
        }
        const key = apiKey();
        if (!key) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not set on the server.' }, { status: 503 });
        }
        return streamCopy(parsed.data, key, authed, request.signal);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

async function readPage(url: string, user: AuthedUser): Promise<CopyContextPage> {
    const fetchedAt = new Date().toISOString();
    try {
        // Drive and Docs links point at viewers; read the file behind them instead.
        const direct = googleDirectUrl(url);
        const page = await fetchPublicPage(direct, { pdfTime: direct !== url || /\.pdf$/i.test(new URL(url).pathname) });
        if (isGoogleSignIn(page.finalUrl)) return { url, title: '', text: '', fetchedAt, error: NOT_SHARED_MESSAGE };
        if (page.pdf) {
            const title = (page.filename ?? '').slice(0, 200);
            const sheet = await summarizePage(title, url, { pdf: page.pdf }, user);
            const usable = pageTextFor('', sheet);
            if (!usable.summarized) return { url, title, text: '', fetchedAt, error: "The PDF couldn't be read. Try again, or paste the key facts into Notes." };
            return { url, title, fetchedAt, ...usable };
        }
        const { title, text } = /text\/(plain|csv)/i.test(page.contentType)
            ? { title: '', text: page.body.slice(0, PAGE_READ_LIMIT) }
            : htmlToPageText(page.body, PAGE_READ_LIMIT);
        if (!text.trim()) return { url, title, text: '', fetchedAt, error: 'The page had no readable text' };
        // Summarized once here, never per write: the sheet is stored as the page's text.
        const sheet = text.length >= PAGE_CONDENSE_MIN ? await summarizePage(title, url, { text }, user) : null;
        return { url, title, fetchedAt, ...pageTextFor(text, sheet) };
    } catch (err) {
        const known = err instanceof PageFetchError || err instanceof GoogleLinkError;
        const message = known ? err.message : 'The page could not be read';
        if (!known) logger.warn('ai', 'Page fetch failed', { url, error: serializeError(err) });
        return { url, title: '', text: '', fetchedAt, error: message };
    }
}

/**
 * Condense a long page (or a PDF) into a context sheet with the small page
 * model, so any site (product page, blog, review site) reaches the copywriter
 * as clean facts. Returns null on any failure: the caller keeps the trimmed
 * page text instead (a PDF has none, so it shows an error).
 */
async function summarizePage(title: string, url: string, page: { text: string } | { pdf: Buffer }, user: AuthedUser): Promise<string | null> {
    const uid = user.uid;
    const key = apiKey();
    if (!key) return null;
    const modelId = pageModelId();
    try {
        const isPdf = 'pdf' in page;
        const { system, prompt } = isPdf ? buildPdfDigestPrompt(title, url) : buildPageDigestPrompt(title, url, page.text);
        const result = await generateText({
            model: createGoogleGenerativeAI({ apiKey: key })(modelId),
            system,
            ...(isPdf
                ? { messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: prompt }, { type: 'file' as const, data: page.pdf, mediaType: 'application/pdf' }] }] }
                : { prompt }),
            maxOutputTokens: 2048,
            providerOptions: thinkingOptionsFor(modelId),
            // The page read can take 15 s for a PDF; the route has 60.
            abortSignal: AbortSignal.timeout(isPdf ? 40_000 : 30_000),
        });
        const sheet = result.text.trim();
        logger.info('ai', 'Page summarized', {
            uid, url, model: modelId, pageChars: isPdf ? undefined : page.text.length, pdfBytes: isPdf ? page.pdf.length : undefined, sheetChars: sheet.length,
            inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
        });
        await recordAiUsage({
            uid, email: user.email, model: modelId, kind: 'page',
            inputTokens: result.usage.inputTokens,
            cachedTokens: result.usage.inputTokenDetails?.cacheReadTokens,
            outputTokens: result.usage.outputTokens,
        });
        return sheet || null;
    } catch (err) {
        logger.warn('ai', 'Page summary failed, keeping page text', { url, model: modelId, error: serializeError(err) });
        return null;
    }
}

function isBadRequest(err: unknown): boolean {
    return (err as { statusCode?: number })?.statusCode === 400;
}

function isModelMissing(err: unknown): boolean {
    const e = err as { statusCode?: number; message?: string };
    return e?.statusCode === 404 || /not found|is not supported|no longer available/i.test(e?.message ?? '');
}

function streamCopy(input: z.infer<typeof writeSchema>, key: string, user: AuthedUser, signal: AbortSignal): Response {
    const uid = user.uid;
    const google = createGoogleGenerativeAI({ apiKey: key });
    const system = buildSystemPrompt(input.brandVoice, input.targetPersonas, input.killList);
    const messages = buildMessages(input.campaign, input.turns, input.row, input.instruction);

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    // Once the browser stops reading (Stop, or the tab closed) writes reject;
    // stop writing then, and the abort signal stops Gemini too.
    let gone = false;
    const write = async (text: string) => {
        if (gone) return;
        try { await writer.write(encoder.encode(text)); } catch { gone = true; }
    };
    const send = (data: unknown) => write(`data: ${JSON.stringify(data)}\n\n`);
    // Recorded for Settings → Usage while the answer finishes; the stream closes after it.
    let recording: Promise<void> | undefined;

    (async () => {
        // Attempts in order: the team model, the same without the thinking
        // option (in case a model rejects it), then the fallback model.
        const primary = geminiModelId();
        const attempts: { modelId: string; thinking: boolean }[] = [{ modelId: primary, thinking: true }];
        if (thinkingOptionsFor(primary)) attempts.push({ modelId: primary, thinking: false });
        if (primary !== FALLBACK_GEMINI_MODEL) attempts.push({ modelId: FALLBACK_GEMINI_MODEL, thinking: true });
        try {
            for (let i = 0; i < attempts.length; i++) {
                const { modelId, thinking } = attempts[i];
                let wrote = false;
                try {
                    const result = streamText({
                        model: google(modelId),
                        system,
                        messages,
                        maxOutputTokens: 8192,
                        providerOptions: thinking ? thinkingOptionsFor(modelId) : undefined,
                        abortSignal: signal,
                    });
                    // fullStream, not textStream: textStream silently drops error
                    // parts, which would end the stream with no message.
                    for await (const part of result.fullStream) {
                        if (part.type === 'error') throw part.error;
                        if (part.type === 'text-delta' && part.text) {
                            wrote = true;
                            await send({ chunk: part.text });
                        }
                    }
                    const usage = await result.usage;
                    const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
                    logger.info('ai', 'Copy written', { uid, model: modelId, inputTokens: usage.inputTokens, cachedTokens: cached, outputTokens: usage.outputTokens });
                    recording = recordAiUsage({ uid, email: user.email, model: modelId, kind: input.kind ?? 'write', inputTokens: usage.inputTokens, cachedTokens: cached, outputTokens: usage.outputTokens });
                    await send({ usage: { model: modelId, inputTokens: usage.inputTokens ?? 0, cachedTokens: cached, outputTokens: usage.outputTokens ?? 0 } });
                    break;
                } catch (err) {
                    // Nothing sent yet: a rejected option retries the same model
                    // without it; a missing model moves on to the fallback.
                    let nextIndex = -1;
                    if (!wrote && isModelMissing(err)) {
                        nextIndex = attempts.findIndex((a, j) => j > i && a.modelId !== modelId);
                    } else if (!wrote && isBadRequest(err) && attempts[i + 1]?.modelId === modelId) {
                        nextIndex = i + 1;
                    }
                    if (nextIndex !== -1) {
                        logger.warn('ai', 'Gemini attempt failed, retrying', { model: modelId, thinking, next: attempts[nextIndex], error: serializeError(err) });
                        i = nextIndex - 1;
                        continue;
                    }
                    throw err;
                }
            }
            await write('data: [DONE]\n\n');
        } catch (error) {
            if (signal.aborted) {
                logger.info('ai', 'Copy stopped by the browser', { uid });
            } else {
                logger.error('ai', 'Copy stream error', { error: serializeError(error) });
                await send({ error: 'The copywriter failed. Try again in a moment.' });
            }
        } finally {
            await recording;
            await writer.close().catch(() => { /* the browser already went away */ });
        }
    })().catch(err => logger.error('ai', 'Copy stream crashed', { error: serializeError(err) }));

    return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
}

export async function GET(request: NextRequest) {
    const authed = await requireAuth(request);
    if (authed instanceof NextResponse) return authed;

    const key = apiKey();
    const model = geminiModelId();
    if (!key) return NextResponse.json({ configured: false, model });

    // Ask Google which models this key can use, so a retired id shows up in
    // Settings instead of as a failed generation.
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            headers: { 'x-goog-api-key': key },
            cache: 'no-store',
        });
        if (!res.ok) return NextResponse.json({ configured: true, model, modelAvailable: null, keyError: `Google answered ${res.status}` });
        const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
        const ids = (data.models ?? [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => m.name.replace(/^models\//, ''));
        return NextResponse.json({
            configured: true,
            model,
            modelAvailable: ids.includes(model),
            fallback: FALLBACK_GEMINI_MODEL,
            proModels: ids.filter(id => id.includes('pro')).sort(),
        });
    } catch (err) {
        logger.warn('ai', 'Model list failed', { error: serializeError(err) });
        return NextResponse.json({ configured: true, model, modelAvailable: null });
    }
}
