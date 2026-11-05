import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';

/**
 * Fetch a public web page for the copywriter, refusing anything that could
 * reach a private network (SSRF). The check runs inside the socket's DNS
 * lookup, so the address that is checked is the address that is connected to
 * — a hostname can't pass the check and then resolve somewhere else. Literal
 * IPs skip DNS, so they're checked up front. Redirects are followed by hand
 * and each hop is checked again. Fails closed.
 */

const BLOCKED = new net.BlockList();
for (const [addr, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(addr, prefix, 'ipv4');
for (const [addr, prefix] of [
    ['::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32],
    // These embed an IPv4 address: 6to4 and Teredo (::/96 above covers IPv4-compatible)
    ['2002::', 16], ['2001::', 32],
] as const) BLOCKED.addSubnet(addr, prefix, 'ipv6');

export function isBlockedAddress(address: string): boolean {
    const family = net.isIP(address);
    if (family === 0) return true;
    if (family === 6) {
        // IPv4-mapped (::ffff:a.b.c.d) → judge the IPv4 address
        const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
        if (mapped) return BLOCKED.check(mapped, 'ipv4');
        return BLOCKED.check(address, 'ipv6');
    }
    return BLOCKED.check(address, 'ipv4');
}

export class PageFetchError extends Error {}

const NOT_READABLE = 'Only web pages, PDFs and Google Docs, Sheets and Slides can be read';

const safeLookup: LookupFunction = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 4);
        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some(a => isBlockedAddress(a.address))) {
            return callback(new PageFetchError('That address is on a private network'), '', 4);
        }
        if ((options as dns.LookupOptions).all) {
            (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
        } else {
            callback(null, list[0].address, list[0].family);
        }
    });
};

export interface FetchedPage {
    finalUrl: string;
    contentType: string;
    /** The page text; empty for a PDF. */
    body: string;
    /** Set when the link is a PDF (checked by its first bytes, not the header). */
    pdf?: Buffer;
    /** The file name the server gave (Content-Disposition), if any. */
    filename?: string;
}

/** What a refused page read means, in plain words (shown on the Context card). */
export function pageStatusMessage(status: number): string {
    if (status === 401 || status === 403 || status === 429) {
        return `This site is blocking automatic reads right now (it answered ${status}). Try again later, or paste the key facts into Notes.`;
    }
    if (status === 404 || status === 410) return `That page wasn't found (${status}). Check the link.`;
    if (status >= 500) return `The site had an error (${status}). Try again later.`;
    return `The page answered ${status}`;
}

const MAX_BYTES = 1_000_000;
/** Gemini takes up to 20 MB per request, and the PDF goes as base64 (+33%). */
export const MAX_PDF_BYTES = 14_000_000;
const TIMEOUT_MS = 5_000;
const PDF_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export function checkPublicUrl(raw: string): URL {
    let url: URL;
    try { url = new URL(raw); } catch { throw new PageFetchError('Not a valid link'); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new PageFetchError('Only http and https links');
    if (url.username || url.password) throw new PageFetchError('Links with credentials are not allowed');
    if (url.port && url.port !== '80' && url.port !== '443') throw new PageFetchError('Only standard ports');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isBlockedAddress(host)) throw new PageFetchError('That address is on a private network');
    if (!net.isIP(host) && !host.includes('.')) throw new PageFetchError('Not a public address');
    return url;
}

type Hop = { status: number; location?: string; contentType: string; body: Buffer; pdf?: true; disposition?: string };

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';

function getOnce(url: URL, deadline: number): Promise<Hop> {
    return new Promise((resolve, reject) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return reject(new PageFetchError('The page took too long'));
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(url, {
            method: 'GET',
            lookup: safeLookup,
            timeout: remaining,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; CampaignOrchestrator/1.0; ad copy context)',
                'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,text/csv;q=0.9,application/pdf;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
            },
        }, res => {
            const status = res.statusCode ?? 0;
            const contentType = String(res.headers['content-type'] ?? '');
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                return resolve({ status, location: res.headers.location, contentType, body: Buffer.alloc(0) });
            }
            if (status >= 400) {
                res.resume();
                return reject(new PageFetchError(pageStatusMessage(status)));
            }
            const textual = /text\/html|application\/xhtml|text\/plain|text\/csv/i.test(contentType);
            // Drive sends PDFs as octet-stream too; the first bytes decide.
            const maybePdf = /application\/(pdf|octet-stream)/i.test(contentType);
            if (!textual && !maybePdf) {
                res.resume();
                return reject(new PageFetchError(NOT_READABLE));
            }
            const cap = textual ? MAX_BYTES : MAX_PDF_BYTES;
            const disposition = String(res.headers['content-disposition'] ?? '') || undefined;
            const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
            const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip())
                : encoding === 'deflate' ? res.pipe(zlib.createInflate())
                    : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress())
                        : res;
            const chunks: Buffer[] = [];
            let size = 0;
            let capped = false;
            let checked = false;
            stream.on('data', (chunk: Buffer) => {
                if (capped) return;
                size += chunk.length;
                if (size > cap) {
                    capped = true;
                    req.destroy();
                    // Half a PDF is unreadable; the top of a page carries the useful part.
                    if (!textual) reject(new PageFetchError(`That PDF is over ${MAX_PDF_BYTES / 1_000_000} MB. Link a smaller one, or paste the key facts into Notes.`));
                    else resolve({ status, contentType, body: Buffer.concat(chunks), disposition });
                    return;
                }
                chunks.push(chunk);
                // Stop early on a download that isn't a PDF, rather than pull 14 MB of it.
                if (!textual && !checked && size >= 5) {
                    checked = true;
                    if (!isPdf(Buffer.concat(chunks))) {
                        capped = true;
                        req.destroy();
                        reject(new PageFetchError(NOT_READABLE));
                    }
                }
            });
            stream.on('end', () => {
                if (capped) return;
                const body = Buffer.concat(chunks);
                if (textual) return resolve({ status, contentType, body, disposition });
                if (!isPdf(body)) return reject(new PageFetchError(NOT_READABLE));
                resolve({ status, contentType, body, pdf: true, disposition });
            });
            stream.on('error', err => reject(err));
        });
        // `timeout` above is per-socket idle time; this caps the whole read.
        const timer = setTimeout(() => req.destroy(new PageFetchError('The page took too long')), remaining);
        req.on('close', () => clearTimeout(timer));
        req.on('timeout', () => req.destroy(new PageFetchError('The page took too long')));
        req.on('error', err => reject(err instanceof PageFetchError ? err : new PageFetchError(friendly(err))));
        req.end();
    });
}

function friendly(err: Error & { code?: string }): string {
    if (err.code === 'ENOTFOUND') return 'That site could not be found';
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') return 'The site refused the connection';
    if (err.message?.includes('private network')) return 'That address is on a private network';
    return 'The page could not be read';
}

/** The file name in a Content-Disposition header (RFC 5987 form first). */
export function dispositionFilename(header: string | undefined): string | undefined {
    if (!header) return undefined;
    const star = header.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i)?.[1];
    if (star) { try { return decodeURIComponent(star.trim()); } catch { /* fall through */ } }
    return header.match(/filename\s*=\s*"([^"]*)"/i)?.[1] ?? header.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim();
}

/**
 * `pdfTime`: a PDF link (a Drive file, say) gets a longer deadline than a page,
 * since the whole file has to arrive.
 */
export async function fetchPublicPage(raw: string, opts: { pdfTime?: boolean } = {}): Promise<FetchedPage> {
    let url = checkPublicUrl(raw);
    const deadline = Date.now() + (opts.pdfTime ? PDF_TIMEOUT_MS : TIMEOUT_MS);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await getOnce(url, deadline);
        if (res.location) {
            url = checkPublicUrl(new URL(res.location, url).toString());
            continue;
        }
        const filename = dispositionFilename(res.disposition);
        if (res.pdf) return { finalUrl: url.toString(), contentType: res.contentType, body: '', pdf: res.body, filename };
        return { finalUrl: url.toString(), contentType: res.contentType, body: res.body.toString('utf8'), filename };
    }
    throw new PageFetchError('Too many redirects');
}
