/**
 * Client-side AI generation functions.
 * These call the server-side /api/ai/generate endpoint to keep API keys secure.
 * Provider-agnostic — the server route handles provider routing.
 */

import { BrainConfig, GeneratedItem, PromptModifier, Product, CustomerPersona, GlobalPromptSettings } from '@/types';
import { authedFetch } from '@/lib/api/authedFetch';
import { parseGeneratedOutput, buildSystemPrompt, buildUserPrompt, buildIterationPrompt, buildCustomIterationPrompt, buildRemixPrompt, getAllModifiers } from './prompts';

export interface GenerationOptions {
    config: BrainConfig;
    type: 'headline' | 'primary_text' | 'both';
    count: number;
    globalSettings?: GlobalPromptSettings;
    customModifiers?: PromptModifier[];
    product?: Product;
    persona?: CustomerPersona;
    previousGenerations?: string[];
}

export interface GenerationResult {
    items: GeneratedItem[];
    rawOutput: string;
    prompts?: {
        system: string;
        user: string;
        timestamp: Date;
    };
}

/**
 * Generate copy via server-side API with streaming
 */
export async function generateCopy(
    options: GenerationOptions,
    onChunk?: (chunk: string) => void
): Promise<GenerationResult> {
    const { config, type, count, globalSettings, customModifiers = [], product, persona, previousGenerations } = options;

    const response = await authedFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateCopy',
            config,
            type,
            count,
            globalSettings,
            customModifiers,
            product,
            persona,
            previousGenerations,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
    }

    // Reconstruct prompts client-side for the Prompt Console
    const allModifiers = getAllModifiers(options.customModifiers || []);
    const systemPrompt = buildSystemPrompt(options.globalSettings);
    const userPrompt = buildUserPrompt(options.config, options.type, options.count, allModifiers, options.product, options.persona);
    let fullUserPrompt = userPrompt;
    if (options.previousGenerations && options.previousGenerations.length > 0) {
        fullUserPrompt = `PREVIOUS GENERATIONS (for variety, create NEW angles):\n${options.previousGenerations.slice(-5).join('\n')}\n\n---\n\n${userPrompt}\n\nIMPORTANT: Create fresh variations that differ from the previous generations listed above.`;
    }

    const result = await processStreamResponse(response, onChunk, globalSettings?.killList ?? []);
    result.prompts = { system: systemPrompt, user: fullUserPrompt, timestamp: new Date() };
    return result;
}

/**
 * Generate iterations of a specific piece of copy via server-side API
 */
export async function generateIteration(
    baseCopy: { text: string; type: 'headline' | 'primary_text' },
    modifier: PromptModifier,
    globalSettings?: GlobalPromptSettings,
    onChunk?: (chunk: string) => void,
    temperature?: number
): Promise<GenerationResult> {
    const response = await authedFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateIteration',
            baseCopy,
            modifier,
            globalSettings,
            temperature,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Iteration failed');
    }

    // Reconstruct prompts client-side for the Prompt Console
    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildIterationPrompt(baseCopy, modifier, 3);

    const result = await processStreamResponse(response, onChunk, globalSettings?.killList ?? []);
    result.prompts = { system: systemPrompt, user: userPrompt, timestamp: new Date() };
    return result;
}

/**
 * Generate a grouped remix — all selected items as vibe-setters, 5 fresh variations
 */
export async function generateRemix(
    items: Array<{ text: string; type: 'headline' | 'primary_text' }>,
    globalSettings?: GlobalPromptSettings,
    onChunk?: (chunk: string) => void,
    count: number = 5,
    temperature?: number
): Promise<GenerationResult> {
    const response = await authedFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateRemix',
            items,
            globalSettings,
            count,
            temperature,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Remix failed');
    }

    const systemPrompt = buildSystemPrompt(globalSettings);
    const userPrompt = buildRemixPrompt(items, count);

    const result = await processStreamResponse(response, onChunk, globalSettings?.killList ?? []);
    result.prompts = { system: systemPrompt, user: userPrompt, timestamp: new Date() };
    return result;
}


/**
 * Generate custom iterations with freeform user direction via server-side API
 */
export async function generateCustomIteration(
    baseCopy: { text: string; type: 'headline' | 'primary_text' },
    customDirection: string,
    globalSettings?: GlobalPromptSettings,
    onChunk?: (chunk: string) => void,
    temperature?: number
): Promise<GenerationResult> {
    const response = await authedFetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'generateCustomIteration',
            baseCopy,
            customDirection,
            globalSettings,
            temperature,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Custom iteration failed');
    }

    // Reconstruct prompts client-side for the Prompt Console
    const systemPromptCustom = buildSystemPrompt(globalSettings);
    const userPromptCustom = buildCustomIterationPrompt(baseCopy, customDirection, 3);

    const result = await processStreamResponse(response, onChunk, globalSettings?.killList ?? []);
    result.prompts = { system: systemPromptCustom, user: userPromptCustom, timestamp: new Date() };
    return result;
}

/**
 * Process SSE stream response and build result
 */
async function processStreamResponse(
    response: Response,
    onChunk?: (chunk: string) => void,
    killList: string[] = []
): Promise<GenerationResult> {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let fullOutput = '';
    let buffer = '';
    let streamError: string | null = null;
    let finished = false;

    while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;

        // SSE frames can be split across network reads. Accumulate into a buffer,
        // process only COMPLETE lines, and carry the trailing partial line into
        // the next read — otherwise a chunk landing on a boundary is lost.
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // last item is an incomplete line (or '')

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') { finished = true; break; }

            let parsed: { chunk?: string; error?: string };
            try {
                parsed = JSON.parse(data);
            } catch {
                continue; // genuinely malformed line — skip
            }
            // Propagate a server-sent error instead of swallowing it in the
            // parse catch (the old code did the latter → silent failures).
            if (parsed.error) { streamError = parsed.error; finished = true; break; }
            if (parsed.chunk) {
                fullOutput += parsed.chunk;
                onChunk?.(parsed.chunk);
            }
        }
    }

    // Flush a final complete frame that arrived without a trailing newline.
    if (!streamError && buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim();
        if (data && data !== '[DONE]') {
            try {
                const parsed = JSON.parse(data) as { chunk?: string; error?: string };
                if (parsed.error) streamError = parsed.error;
                else if (parsed.chunk) { fullOutput += parsed.chunk; onChunk?.(parsed.chunk); }
            } catch { /* ignore trailing partial */ }
        }
    }

    if (streamError) {
        throw new Error(streamError);
    }

    // Parse the output into structured items (de-duped + kill-list enforced)
    const parsedItems = parseGeneratedOutput(fullOutput, killList);
    const items: GeneratedItem[] = parsedItems.map((item, index) => ({
        id: `gen-${Date.now()}-${index}`,
        text: item.text,
        type: item.type,
        status: 'pending' as const,
        sourceModifiers: [],
        createdAt: new Date(),
    }));

    return {
        items,
        rawOutput: fullOutput,
    };
}

/**
 * Check if any AI provider is configured.
 * Checks both env vars (server endpoint) and settings-stored keys.
 */
export function isApiKeyConfigured(_globalSettings?: GlobalPromptSettings): boolean {
    // Provider keys are server-side env vars now; the real validation happens on
    // the server at generation time (getModel throws a clear error if none is set).
    return true;
}
