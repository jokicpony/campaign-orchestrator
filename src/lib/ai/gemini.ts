/**
 * The copywriter's Gemini model. One model for the whole team, chosen here
 * (or with the GEMINI_MODEL env var, no code change needed). Settings → Brand
 * Voice shows whether the team key can see it. Model ids go stale: if the
 * primary is retired, the route falls back to FALLBACK_GEMINI_MODEL.
 * Server-only (reads process.env).
 *
 * Argon: GA Oct 2026; implicit caching only (no named caches), and only on
 * requests of 4,096+ tokens; ignores temperature; thinking levels
 * low/medium/high. Output tokens (billed) include thinking.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-4-argon';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.8-flash';
/** Small, fast model that condenses each linked page into a context sheet. */
export const DEFAULT_PAGE_MODEL = FALLBACK_GEMINI_MODEL;

export function geminiModelId(): string {
    return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function pageModelId(): string {
    return process.env.GEMINI_SUMMARY_MODEL?.trim() || DEFAULT_PAGE_MODEL;
}

/** Ask thinking models to think briefly: copy needs little of it, and it's faster. */
export function thinkingOptionsFor(modelId: string) {
    return /^gemini-(3|4)/.test(modelId)
        ? { google: { thinkingConfig: { thinkingLevel: 'low' as const } } }
        : undefined;
}
