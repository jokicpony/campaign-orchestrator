# Multi-Media Ads (`media_sourcing_spec`)

Meta's documented API for what Ads Manager calls **"Single image or video" with
uploaded media**: one ad, up to 10 images + videos, with per-media placement,
text, destination, and crop customizations. It is the public write path
for Ads Manager's "Uploaded media" groups, and the successor of flexible ads.

Source: https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/multi-media-ads
(updated 2026-09-04, no beta/allowlist wording).

## Status

- Ad type `multi_media` ("Multi-Media", alias `Multi`). Flexible stays
  available and still publishes via the `creative_asset_groups_spec` shim.
- **Live-validated** against a real ad account: read, validate-only matrix,
  and a real PAUSED create with full read-back — all passed (below). Ads
  Manager shows an API-built ad as "Uploaded media" with its stacks intact.
- **Not built yet:** manual stack/unstack, drag-reorder, persisting stacks on
  the row.

## Live probe results (Oct 8 2026, v25, `scripts/probe-multi-media.mts`)

**Read** (`probe read <campaign>`) — a campaign built in Ads Manager:

- Ads Manager's "Uploaded media" ads now read back with `media_sourcing_spec`
  fully populated (in Aug 2026 the group was not visible to the API).
- **Ads Manager models orientation as variant groups, not placement
  exclusions:** each creative concept is a set of images sharing a client
  UUID `group_id`, each tagged `variant_types: ["SQUARE"]` or
  `["FULLSCREEN_VERTICAL"]`. Videos carry no group/variant fields.
- Older `$Flex` ads (cags shim writes) read back as plain `multi_media`
  items — Meta migrated flexible ads into this format. Multi-media IS the
  successor of flexible.
- Meta also injects its own media: `source: "related_media"` items
  (`creation_source` ADVERTISER_UPLOAD / WEBSITE_MEDIA, `retriever_sources`
  creative_graph / website_media / ads_llama), mostly `opt_out` but some with
  no status, and on one ad a `source: "gen_ai"` video with `opt_in`.
- Extra read-only fields: `thumbnail_id`, `creation_source`,
  `retriever_sources`; AI text variants carry `action_type`, `asset_source`,
  `uuid`. Some AM-written videos omit `thumbnail_url`.

**validate_only** in that campaign's ad set (OUTCOME_SALES,
`is_dynamic_creative=false`, multi-ad), 2 square + 1 vertical image + 1 video:

| Shape | Result |
|---|---|
| per-media `placement_customizations` exclusions | ✅ accepted |
| AM-style `group_id` + `variant_types` (SQUARE + FULLSCREEN_VERTICAL pair) | ✅ accepted |
| invalid variant type | ❌ — error lists the enum (below) |

`variant_types` enum: `CIRCLE, FOUR_BY_THREE, FULLSCREEN_LANDSCAPE,
FULLSCREEN_VERTICAL, HORIZONTAL, NINE_BY_NINE_POINT_TWO_FIVE,
NINE_BY_TEN_POINT_NINE_THREE_SEVEN_FIVE, NINE_HUNDRED_BY_NINE_HUNDRED_TWENTY_FIVE,
ORIGINAL, SIXTEEN_BY_NINE, SQUARE, THREE_BY_FOUR, VERTICAL`.
Seen in AM writes: SQUARE (1:1), FULLSCREEN_VERTICAL (9:16). Likely: VERTICAL
= 4:5, HORIZONTAL = 1.91:1 — unconfirmed.

**validate_only matrix** (same ad set, `probe matrix`, Oct 8 2026):

| Case | Result |
|---|---|
| A image lead + stack + solo image + video (app baseline) | ✅ |
| B video lead + images · C videos only · D single image · E single video | ✅ |
| F + all 14 Advantage+ enhancements · G + instagram_user_id · H both (real publish shape) | ✅ |
| L 3-shape stack 1:1 + 4:5 (VERTICAL) + 9:16 | ✅ |
| K image with group_id but no variant_types | ✅ |
| I 2 videos stacked · J image + video in one stack | ❌ `Unexpected key "group_id" on param "media_sourcing_spec['videos'][0]"` — videos can't be grouped; "videos never stack" is Meta's rule |
| M HORIZONTAL (wide) in a stack | not run — no wide test image |

**Real PAUSED create** (`probe create`, one test ad, Oct 8 2026) —
real publish shape: Instagram identity + all 14 wizard-default enhancements,
stack 1 = 1:1 + 9:16 + 4:5, a solo square, a video:

- Media: 5 sent → 5 persisted as `multi_media`. Stacks: 2 sent → 2 persisted,
  our `group_id`s and every `variant_types` (incl. VERTICAL) unchanged.
- Enhancements: our 14 OPT_INs persisted; Meta filled the other ~69
  `creative_features_spec` keys with explicit OPT_OUT (incl.
  `media_type_automation`, `video_to_image`, `music_generation`,
  `text_generation`).
- Meta added NO `related_media` / `gen_ai` items — those on AM-built ads come
  from Ads Manager's own toggles, not API defaults.
- Video `picture` thumbnail is 160×160 (`p160x160`) → publish route now
  prefers the full-size preferred thumbnail from `/{video}/thumbnails`.

Still open: delivery (`breakdowns=media_asset` after spend). In Ads
Manager the probe ad's video tile showed a black thumbnail — the probe sent
the 160px `picture`; the app now sends the full-size preferred thumbnail.

## Payload (what the publish route sends)

One-step `POST /act_<id>/ads` with an inline `creative`:

```jsonc
{
  "object_story_spec": {
    "page_id": "…",
    // primary = first asset in the row; it must ALSO appear in the spec below
    "link_data": { "link": "…", "image_hash": "<H1>", "call_to_action": {…} }
    // or "video_data": { "video_id": "<V1>", "image_url": "<thumb>", "call_to_action": {…} }
  },
  "media_sourcing_spec": {
    "images": [
      { "hash": "<H1>", "source": "multi_media", "opt_in_status": "opt_in",
        "group_id": "<uuid A>", "variant_types": ["SQUARE"] },
      { "hash": "<H2>", "source": "multi_media", "opt_in_status": "opt_in",
        "group_id": "<uuid A>", "variant_types": ["FULLSCREEN_VERTICAL"] }
    ],
    "videos": [{ "video_id": "<V1>", "original_video_id": "<V1>", "source": "multi_media",
                 "opt_in_status": "opt_in", "thumbnail_source": "generated_default",
                 "thumbnail_url": "<thumb>" }],
    "bodies": [{ "text": "…" }],   // Primary Texts 1–5
    "titles": [{ "text": "…" }]    // Headlines 1–5
  },
  "degrees_of_freedom_spec": {…},  // enhancement toggles, same as other types
  "url_tags": "…"
}
```

Rules enforced by `buildMediaSourcingSpec` (`src/lib/meta/multiMedia.ts`): max
10 items — every file counts, including each shape in a stack, matching Ads
Manager's own count (the asset picker and type switching enforce the same
cap) — duplicate hashes/video ids dropped, every video gets a thumbnail
(the route waits for each video to finish processing and fails clearly if
one has no thumbnail).

After creating the ad, the route reads back `creative{media_sourcing_spec}`
and compares item-by-item (only `source: multi_media` entries — Meta adds its
own `related_media`/`gen_ai` items) plus stack count. Missing items, lost
stacks, or de-duplicated identical files come back as a `warning`, shown in
the wizard results as "Published — check". Earlier mixed-media write shapes
were accepted and then silently dropped videos, so that warning is the first
thing to look at.

## Stacks (orientation variants)

Mirrors Ads Manager's "Uploaded media" stacks. `buildStacks` groups a row's
images whose file names match apart from an orientation tag:

- Tags recognized: sizes (`1080x1920`), ratios (`9x16`, `9-16`, `1:1`,
  `1.91x1`), and words (`square`, `vertical`, `portrait`, `landscape`, `wide`,
  `story`, `reels`, `feed`, …). `Toast_9x16.jpg` + `Toast_1x1.png` → one stack.
- Second, looser pass: images still alone pair up when their names match
  apart from version words too (`V1`, `v02`, `ver3`, `version 2`, `rev1`,
  `copy`, `final`) — `HatLady_V1` (square) + `HatLady_V2` (9:16) → one stack.
  It never adds to a stack the exact pass formed, and never touches numbered
  files (`AdName_2`, `Toast_V1_3` — usually this app's rename) or Canva-style
  `(1)` duplicates. Known miss: two DIFFERENT concepts named only by version
  (`X_V1` square, `X_V2` vertical) get paired — visible on the confirm step;
  fix will be the manual unstack control.
- Shape always comes from the file's real pixel dimensions (Drive metadata),
  never from the name; names only decide which files belong together.
- A stack holds at most one image per variant type; a second same-shape match
  starts its own stack.
- Videos, images without Drive size info, and unmatched images stand alone.
- Variant type comes from the Drive dimensions: <0.7 → FULLSCREEN_VERTICAL,
  <0.9 → VERTICAL, ≤1.1 → SQUARE, else HORIZONTAL.

Stacks are computed from names, not stored, by the same function the
wizard publishes with. `MediaStacks` draws them in three places: a "Media
Stacks" panel under the builder row's copy slots, Review mode's card, and the
publish wizard's creative-confirm step. In builder and Review, clicking a
stack previews it and clicking again cycles its shapes.

**Rename:** publishing renames Drive files to the ad name. For multi-media
the suffix is stack number + shape — `AdName_1_1x1`, `AdName_1_9x16`,
`AdName_2_1x1`, `AdName_3.mp4` — which `stackKey` reads back, so stacks
survive reuse of already-published files. Other ad types keep `_1, _2, _3`.
The extension comes from the real Drive file name. When several rows in one
batch share a file, only the first row to start renames it (concurrent
renames used to interleave and split stacks across ad names).

**Lead media:** the row's first asset is `object_story_spec`'s primary. The
asset picker keeps click order (existing assets first, new picks appended)
and numbers selected tiles; stacks label the lead.

Not built yet: manual stack/unstack overrides, drag-reorder, persisting
stacks on the row.

## Open questions

Answered by the Oct 8 probes: Ads-Manager ads read back with
`media_sourcing_spec`; the real publish shape validates in a regular
OUTCOME_SALES multi-ad ad set; a PAUSED create persists every item, stack and
variant; `degrees_of_freedom_spec` coexists with it.

Still open:
1. After spend, does `/insights?breakdowns=media_asset` show every item
   delivering, and the right shape per placement?
2. Other objectives, and existing dynamic-creative ad sets (no UI restriction
   for multi-media yet).
3. HORIZONTAL (wide) in a stack — never validated (no wide test image).

## Testing a publish

Server-side Firestore access uses Workload Identity Federation, which only
works on the production deployment (see SECURITY.md). Everything publishes
PAUSED.

1. Reconnect Meta after upgrading (Settings → Connections) — recent Meta
   fixes added a scope and corrected Instagram account IDs.
2. One Multi-Media row: a same-name 1:1 + 9:16 pair, plus a video. In the same
   batch, one carousel (checks that cards keep click order).
3. Expect a green "Published". An amber "Published — check" means the
   read-back found missing items or lost stacks — open its warning.
4. In Ads Manager: "Uploaded media" shows the stack + video, the video has a
   real thumbnail, and the Drive files were renamed `AdName_1_1x1`,
   `AdName_1_9x16`, `AdName_2.mp4`.

## Edge cases to watch in testing

Validated offline (`scripts/test-multi-media.mts`) — stacking + payload:
naming variants, version words, renamed files, Canva duplicates, one image
per shape per stack, dedupe-before-cap, malformed input, stack adjacency.

Known limits / not handled yet:
- Two different concepts named only by version (`X_V1` square, `X_V2`
  vertical) get paired by the loose pass — visible on the confirm step.
- Stacks are derived from current names: opening a row's picker after
  another ad renamed shared files can change its stacks (library isn't
  re-fetched after publish).
- Rename happens before Meta confirms the ad (all types, pre-existing).
- EXIF-rotated phone photos: Drive reports unrotated width/height.
- Switching a full Multi-Media row to a smaller type keeps only the first
  assets that fit (all types, pre-existing).
