/**
 * Google Drive, Docs, Sheets and Slides share links open JavaScript viewers
 * that have no readable text. Rewrite them to the address that returns the
 * file itself: Docs and Slides as plain text, Sheets as CSV, Drive files
 * (usually PDFs) as a download. Only works for files shared as "Anyone with
 * the link". Anything else is returned unchanged.
 */

const ID = '([A-Za-z0-9_-]{20,})';
const DOCS = new RegExp(`^/(document|spreadsheets|presentation)(?:/u/\\d+)?/d/${ID}`);
const DRIVE_FILE = new RegExp(`^/file(?:/u/\\d+)?/d/${ID}`);

export class GoogleLinkError extends Error {}

export function googleDirectUrl(raw: string): string {
    let url: URL;
    try { url = new URL(raw); } catch { return raw; }
    const host = url.hostname.toLowerCase();

    if (host === 'docs.google.com') {
        // Published-to-web pages (/d/e/…/pub) are plain HTML already: the id check skips them.
        const m = url.pathname.match(DOCS);
        if (!m) return raw;
        const [, kind, id] = m;
        if (kind === 'document') return `https://docs.google.com/document/d/${id}/export?format=txt`;
        if (kind === 'presentation') return `https://docs.google.com/presentation/d/${id}/export/txt`;
        const gid = url.hash.match(/gid=(\d+)/)?.[1] ?? url.searchParams.get('gid');
        return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
    }

    if (host === 'drive.google.com') {
        if (/^\/drive(?:\/u\/\d+)?\/(?:mobile\/)?folders\//.test(url.pathname)) {
            throw new GoogleLinkError("A Drive folder can't be read. Link the file instead.");
        }
        const id = url.pathname.match(DRIVE_FILE)?.[1]
            ?? (/^\/(open|uc)$/.test(url.pathname) ? url.searchParams.get('id') : null);
        if (!id || !new RegExp(`^${ID}$`).test(id)) return raw;
        // confirm=t skips the "can't scan this file for viruses" page on larger files.
        return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
    }

    return raw;
}

/** Google sends a file that isn't shared publicly to its sign-in page. */
export function isGoogleSignIn(finalUrl: string): boolean {
    try { return new URL(finalUrl).hostname.toLowerCase() === 'accounts.google.com'; } catch { return false; }
}

export const NOT_SHARED_MESSAGE = 'That Google file isn\'t public. Share it as "Anyone with the link" and press Read again.';
