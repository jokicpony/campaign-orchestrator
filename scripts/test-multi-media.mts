/**
 * Offline checks for src/lib/meta/multiMedia.ts (stacking + payload builder).
 * No network. Run: node --experimental-strip-types --no-warnings scripts/test-multi-media.mts
 */
import assert from 'node:assert/strict';
import {
    buildMediaSourcingSpec,
    buildStacks,
    looseStackKey,
    normalizeMediaItems,
    stackKey,
    variantTypeFor,
    type StackableAsset,
} from '../src/lib/meta/multiMedia.ts';

const sq = { width: 1080, height: 1080 };
const tall = { width: 1080, height: 1920 };
const fourFive = { width: 1080, height: 1350 };
const wide = { width: 1200, height: 628 };
const img = (name: string, dimensions?: { width: number; height: number }): StackableAsset => ({ type: 'image', name, dimensions });
const vid = (name: string, dimensions?: { width: number; height: number }): StackableAsset => ({ type: 'video', name, dimensions });
const stacks = (assets: StackableAsset[]) => buildStacks(assets).map(s => s.members);

// Shape comes from pixels
assert.equal(variantTypeFor(1080, 1920), 'FULLSCREEN_VERTICAL');
assert.equal(variantTypeFor(1080, 1350), 'VERTICAL');
assert.equal(variantTypeFor(1080, 1080), 'SQUARE');
assert.equal(variantTypeFor(1200, 628), 'HORIZONTAL');
assert.equal(variantTypeFor(undefined, 1080), undefined);

// Exact keys: orientation tags stripped
for (const n of ['Toast_1x1', 'Toast_9x16', 'Toast 9-16', 'Toast_16:9', 'Toast_4x5', 'Toast_1.91x1', 'Toast 1080x1920', 'toast_SQ', 'Toast-Story', 'Toast_9x16.png']) {
    assert.equal(stackKey(n), 'toast', n);
}
// …but not things that merely look like numbers
assert.equal(stackKey('Launch 10:30'), 'launch_10:30');
assert.equal(stackKey('Toast_1-2'), 'toast_1_2');
assert.equal(stackKey('Hat.v2'), 'hat_v2'); // ".v2" isn't mistaken for an extension

// Loose keys: version words ignored; numbered/renamed files never loosely pair
assert.equal(looseStackKey('Picnic_V1'), looseStackKey('Picnic-v2-final'));
assert.equal(looseStackKey('Beach_Version 2'), looseStackKey('Beach_final'));
assert.equal(looseStackKey('AdName_2'), undefined);
assert.notEqual(looseStackKey('Untitled design'), looseStackKey('Untitled design (1)'));

// Stacking
assert.deepEqual(stacks([img('Picnic_1x1', sq), img('Mug_1x1', sq), vid('Toast_9x16', tall), img('Picnic_9x16', tall), img('Mug_9x16', tall), img('NoDims')]),
    [[0, 3], [1, 4], [2], [5]]);
assert.deepEqual(stacks([img('Toast 1x1', sq), img('Toast_1x1', sq)]), [[0], [1]]); // one per shape
assert.deepEqual(stacks([img('Picnic_V1', sq), img('Mug_V1', sq), img('Picnic_V2', tall), img('Mug_V2', tall)]), [[0, 2], [1, 3]]);
assert.deepEqual(stacks([img('Picnic_V1_1x1', sq), img('Picnic_V2_1x1', sq), img('Picnic_V1_9x16', tall), img('Picnic_V2_9x16', tall)]), [[0, 2], [1, 3]]);
assert.deepEqual(stacks([img('Toast_V1_1x1', sq), img('Toast_V1_9x16', tall), img('Toast_V2', fourFive)]), [[0, 1], [2]]); // loose never joins exact
assert.deepEqual(stacks([img('Toast_1x1', sq), img('Toast_4x5', fourFive), img('Toast_9x16', tall), img('Toast_wide', wide)]), [[0, 1, 2, 3]]);
assert.deepEqual(stacks([img('$P_Gift_$Multi_1_1x1', sq), img('$P_Gift_$Multi_1_9x16', tall), img('$P_Gift_$Multi_2_1x1', sq), img('$P_Gift_$Multi_3_9x16', tall)]), [[0, 1], [2], [3]]);
assert.deepEqual(stacks([img('Summer_Toast_V1_Multi_1', sq), img('Summer_Toast_V2_Multi_1', tall)]), [[0], [1]]);
assert.deepEqual(stacks([img('Untitled design', sq), img('Untitled design (1)', tall)]), [[0], [1]]);

// Input normalization: malformed dropped, dedupe BEFORE the 10 cap
const norm = normalizeMediaItems([null, { type: 'gif', hash: 'x' }, { type: 'image', hash: 'a' }, { type: 'image', hash: 'a' },
    ...Array.from({ length: 10 }, (_, i) => ({ type: 'image', hash: `h${i}` }))]);
assert.equal(norm.droppedInvalid, 2);
assert.equal(norm.droppedDuplicates, 1);
assert.equal(norm.items.length, 10);
assert.equal(norm.items[0].hash, 'a');
assert.equal(normalizeMediaItems('nope').items.length, 0);

// Payload: stacks share a group_id, images of a stack stay adjacent, videos plain
const built = buildMediaSourcingSpec({
    items: [
        { type: 'image', hash: 'a', ...sq, stack: 0 },
        { type: 'image', hash: 'b', ...sq, stack: 1 },
        { type: 'video', videoId: 'v', thumbnailUrl: 'https://t', stack: 2 },
        { type: 'image', hash: 'c', ...tall, stack: 0 },
        { type: 'image', hash: 'a', ...sq, stack: 0 }, // duplicate
    ],
    primaryTexts: ['p1', 'p2'],
    headlines: ['h1'],
});
const images = (built.spec as { images: Array<Record<string, unknown>> }).images;
const videos = (built.spec as { videos: Array<Record<string, unknown>> }).videos;
assert.deepEqual(images.map(i => i.hash), ['a', 'c', 'b']);
assert.equal(images[0].group_id, images[1].group_id);
assert.notEqual(images[0].group_id, images[2].group_id);
assert.deepEqual(images[1].variant_types, ['FULLSCREEN_VERTICAL']);
assert.equal(images[0].source, 'multi_media');
assert.equal(videos[0].original_video_id, 'v');
assert.equal(videos[0].group_id, undefined);
assert.equal(built.items[0].hash, 'a'); // primary preserved
assert.equal(built.groupCount, 2);
assert.equal(built.droppedDuplicates, 1);

console.log('multi-media checks passed');
