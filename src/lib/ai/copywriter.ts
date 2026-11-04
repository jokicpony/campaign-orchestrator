'use client';

/**
 * Browser side of the campaign copywriter: reads pages and streams copy via
 * /api/ai/copy. The Gemini key never leaves the server.
 */
import { authedFetch } from '@/lib/api/authedFetch';
import type { CopyCampaignContext, CopyContextPage, CopyRowContext, CopyTurn } from '@/types/copywriter';
import { parseGeneratedOutput, type ParsedCopy } from './prompts';

export interface CopyUsage {
    model: string;
    inputTokens: number;
    cachedTokens: number;
    outputTokens: number;
}

export interface WriteCopyInput {
    brandVoice: string;
    targetPersonas: string;
    killList: string[];
    campaign: CopyCampaignContext;
    turns: CopyTurn[];
    row: CopyRowContext;
    instruction: string;
    /** What the ask is for, only to group Settings → Usage. */
    kind?: 'write' | 'fill' | 'story';
}

export interface WriteCopyResult {
    raw: string;
    items: ParsedCopy[];
    usage?: CopyUsage;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return new Error(body.error || fallback);
}

/** Read public pages on the server. Each page comes back with text or an error. */
export async function fetchContextPages(urls: string[]): Promise<CopyContextPage[]> {
    const res = await authedFetch('/api/ai/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pages', urls }),
    });
    if (!res.ok) throw await errorFrom(res, 'Could not read the pages');
    return ((await res.json()) as { pages: CopyContextPage[] }).pages;
}

/**
 * Stream copy for one row. `onText` gets the raw text so far. `untagged`: if
 * the answer has no [H]/[P] tags at all, keep it whole as one piece of this type.
 */
export async function writeCopy(input: WriteCopyInput, onText?: (soFar: string) => void, signal?: AbortSignal, untagged?: ParsedCopy['type']): Promise<WriteCopyResult> {
    const res = await authedFetch('/api/ai/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', ...input }),
        signal,
    });
    if (!res.ok) throw await errorFrom(res, 'The copywriter failed');
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response from the copywriter');

    const decoder = new TextDecoder();
    let raw = '';
    let buffer = '';
    let usage: CopyUsage | undefined;
    let finished = false;

    const handle = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { finished = true; return; }
        let parsed: { chunk?: string; error?: string; usage?: CopyUsage };
        try { parsed = JSON.parse(data); } catch { return; }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.usage) usage = parsed.usage;
        if (parsed.chunk) {
            raw += parsed.chunk;
            onText?.(raw);
        }
    };

    // SSE frames can split across reads: keep the trailing partial line.
    while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            handle(line);
            if (finished) break;
        }
    }
    if (!finished && buffer) handle(buffer);
    if (!finished) throw new Error('The copywriter stopped early. Try again.');

    return { raw, items: parseGeneratedOutput(raw, input.killList, untagged), usage };
}

export interface CopywriterStatus {
    configured: boolean;
    model: string;
    modelAvailable?: boolean | null;
    fallback?: string;
    proModels?: string[];
    keyError?: string;
}

export async function getCopywriterStatus(): Promise<CopywriterStatus> {
    const res = await authedFetch('/api/ai/copy');
    if (!res.ok) throw await errorFrom(res, 'Could not check the copywriter');
    return res.json();
}
