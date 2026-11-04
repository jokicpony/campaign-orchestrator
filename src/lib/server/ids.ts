/**
 * Shape checks for ids the browser sends that the server pastes into a Graph
 * or Drive URL path. A crafted id containing `/`, `?` or `&` could otherwise
 * point a server call (made with the user's server-held Meta token) at a
 * different endpoint. Kept free of runtime imports so the offline tests can
 * load it.
 */

// Ad accounts are `act_<digits>`; campaigns, ad sets, videos and Pages are digits.
const META_ID = /^(act_)?\d{1,30}$/;
// Drive file ids are URL-safe base64-ish strings.
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{1,200}$/;

export function isMetaId(value: unknown): value is string {
    return typeof value === 'string' && META_ID.test(value);
}

export function isDriveFileId(value: unknown): value is string {
    return typeof value === 'string' && DRIVE_FILE_ID.test(value);
}
