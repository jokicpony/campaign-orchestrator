/**
 * Unified Structured Logger
 *
 * Consistent structured logging across the app (tag via APP_NAME env).
 * - Dev:        colored human-readable output with [app/tag] prefix
 * - Production: single-line JSON for Vercel Log Drains / machine parsing
 *
 * Usage:
 *   import { logger, serializeError } from '@/lib/logger';
 *   logger.info('publish', 'Campaign created', { campaignId: '123' });
 *   logger.error('meta', 'API call failed', { error: serializeError(err) });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    app: string;
    env: string;
    level: LogLevel;
    tag: string;
    message: string;
    ts: number;
    requestId?: string;
    [key: string]: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const APP_NAME = process.env.APP_NAME || 'campaign-orchestrator';
const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const IS_JSON = ENV === 'production' || process.env.CI === 'true';

/**
 * Safely serialize an error for structured logging.
 * Preserves message, stack, and any custom properties (e.g. `code`, `status`).
 *
 * Usage: logger.error('tag', 'msg', { error: serializeError(err) });
 */
export function serializeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
            // Capture common custom properties from fetch / API errors
            ...('code' in err ? { code: (err as Record<string, unknown>).code } : {}),
            ...('status' in err ? { status: (err as Record<string, unknown>).status } : {}),
            ...('cause' in err && err.cause ? { cause: String(err.cause) } : {}),
        };
    }
    return { message: String(err) };
}

/**
 * Extract the diagnostic fields from a Meta Graph API error response for logging.
 * These are the fields you (and Meta support) need to trace a publish failure —
 * `fbtrace_id` and `error_subcode` especially. Pass the parsed Graph JSON body.
 */
export function serializeMetaError(result: unknown): Record<string, unknown> {
    const err = (result as { error?: Record<string, unknown> } | null)?.error;
    if (!err || typeof err !== 'object') {
        // No standard error envelope — keep the raw body so nothing is lost.
        return { raw: result };
    }
    return {
        message: err.message,
        type: err.type,
        code: err.code,
        error_subcode: err.error_subcode,
        fbtrace_id: err.fbtrace_id,          // cite this to Meta support
        error_user_title: err.error_user_title,
        error_user_msg: err.error_user_msg,  // the user-facing reason, often the real cause
        is_transient: err.is_transient,      // true => safe to retry
    };
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatDev(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>): string {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const prefix = `${APP_NAME}/${tag}`;
    const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
    return `${ts} [${prefix}] ${message}${metaStr}`;
}

function emit(level: LogLevel, tag: string, message: string, meta?: Record<string, unknown>) {
    if (!shouldLog(level)) return;

    if (IS_JSON) {
        const entry: LogEntry = { app: APP_NAME, env: ENV, level, tag, message, ...meta, ts: Date.now() };
        const line = JSON.stringify(entry);
        if (level === 'error') {
            console.error(line);
        } else if (level === 'warn') {
            console.warn(line);
        } else {
            console.log(line);
        }
    } else {
        const formatted = formatDev(level, tag, message, meta);
        if (level === 'error') {
            console.error(formatted);
        } else if (level === 'warn') {
            console.warn(formatted);
        } else {
            console.log(formatted);
        }
    }
}

export const logger = {
    debug: (tag: string, message: string, meta?: Record<string, unknown>) => emit('debug', tag, message, meta),
    info: (tag: string, message: string, meta?: Record<string, unknown>) => emit('info', tag, message, meta),
    warn: (tag: string, message: string, meta?: Record<string, unknown>) => emit('warn', tag, message, meta),
    error: (tag: string, message: string, meta?: Record<string, unknown>) => emit('error', tag, message, meta),
};
