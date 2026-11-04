/**
 * Offline checks for the id guards the API routes apply before putting a
 * browser-sent id into a Graph or Drive URL path. No network.
 * Run: node --experimental-strip-types --no-warnings scripts/test-request-ids.mts
 */
import assert from 'node:assert/strict';
import { isDriveFileId, isMetaId } from '../src/lib/server/ids.ts';

for (const ok of ['act_1234567890', '120210000000000000', '1']) assert.equal(isMetaId(ok), true, ok);
for (const bad of ['', 'act_', 'act_12/ads', '123?fields=x', '123&access_token=x', 'me', '../me', 'act_12#', 123, null, undefined, ['1']]) {
    assert.equal(isMetaId(bad), false, String(bad));
}

for (const ok of ['1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvW', 'abc_DEF-123']) assert.equal(isDriveFileId(ok), true, ok);
for (const bad of ['', 'abc/def', 'abc?alt=media', '../files', 'abc def', 'a'.repeat(201), 42, null]) {
    assert.equal(isDriveFileId(bad), false, String(bad));
}

console.log('request ids: all checks passed');
