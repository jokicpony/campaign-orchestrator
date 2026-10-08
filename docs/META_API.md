# Meta API — what we send and why

The Marketing API is the most fragile part of the app: Meta changes formats,
deprecates fields and rewrites stored ads. This is what the publish path sends
for each ad type, the rules Meta enforces, and what we learned probing it. How
publishing fits into the app is in [ARCHITECTURE.md](ARCHITECTURE.md#flow-4--publishing).

Graph API **v25.0**, pinned in `src/lib/meta/constants.ts` (and separately in
`functions/transcode-and-upload/src/index.ts`). v24 expired 6 Oct 2026; v25's
end date isn't announced yet — check the
[version changelog](https://developers.facebook.com/docs/graph-api/changelog/versions/).

## Campaigns and ad sets

`src/app/api/meta/campaign/route.ts`, `src/app/api/meta/adset/route.ts`.

- **Status is always PAUSED.**
- **"Advantage+ Shopping (ASC)" in the wizard is a standard `OUTCOME_SALES`
  campaign.** Meta removed ASC/AAC creation from the API in v25
  (`smart_promotion_type` is gone). Don't re-add it.
- `is_adset_budget_sharing_enabled` is required when the campaign doesn't use
  campaign budget (CBO); it's hardcoded `false`. With CBO on, the ad set must
  have **no** budget and no `bid_strategy`. Budgets are in cents.
- Targeting: countries from `DEFAULT_TARGET_COUNTRIES` (`['US']`,
  `src/lib/config/deployment.ts`), `age_min` from Settings → Ad Setup →
  Audience Defaults (fallback `DEFAULT_AGE_MIN` = 18 — raise it for
  age-restricted products), clamped to 13–65.
- **Special ad categories:** `FINANCIAL_PRODUCTS_SERVICES` (was `CREDIT`),
  `EMPLOYMENT`, `HOUSING`, `ISSUES_ELECTIONS_POLITICS` (was `SOCIAL_ISSUES…`).
  Campaigns also send `special_ad_category_country`. Housing, employment and
  financial ad sets omit age/gender and send
  `targeting_automation.advantage_audience` (required on all versions from
  27 Oct 2026). Meta may report `"NONE"` as a category — ignore it.
- `VALUE` (ROAS) optimisation needs a pixel `promoted_object`; non-Sales
  objectives use a Page `promoted_object`. Incremental attribution exists only
  for Sales; Awareness/Engagement need a 1-day-click `attribution_spec`.

## Media upload

`src/app/api/meta/upload/from-drive/route.ts` — server-to-server, the browser
never touches the file.

- **Images:** downloaded from Drive (`supportsAllDrives=true`), POSTed to
  `/act_<id>/adimages` → `hash`. Identical bytes give the same hash, even
  under different names.
- **Videos ≤ 50 MB:** buffered and POSTed to `/act_<id>/advideos`.
- **Videos > 50 MB:** sent to the transcode Cloud Function with an
  `x-api-key` (`TRANSCODE_API_KEY`). It streams from Drive to disk, re-encodes
  (H.264, ≤1920 wide, AAC, faststart) and uploads to Meta with the user's
  tokens, which the request carries — the function is given no Google or Meta
  credentials of its own. Without `VIDEO_TRANSCODE_FUNCTION_URL` every video takes the direct
  path.
- **Videos must finish processing before an ad can use them.** The publish
  route polls every video in parallel (20 × 3 s). A video that reports
  *failed processing* must be re-uploaded; retrying won't help. The thumbnail
  is the `is_preferred` one from `/{video}/thumbnails` — the video's `picture`
  is only 160×160.

## Ads, by type

All created with `POST /act_<id>/ads`, status PAUSED, `page_id` and
`instagram_user_id` in `object_story_spec`, UTM parameters in
`creative.url_tags` (never appended to the link), and the wizard's
Advantage+ toggles as
`degrees_of_freedom_spec.creative_features_spec.<feature>.enroll_status = OPT_IN`.
Meta fills every toggle we don't send with an explicit `OPT_OUT`.

**Instagram identity:** `instagram_user_id` is the selected Page's
`instagram_business_account.id` (`src/lib/meta/client.ts`). Not the
ad account's `/instagram_accounts`, not `ig_id` — this went back and forth
four times before it stuck.

### Multi-Media (`multi_media`) — the current format

What Ads Manager calls **"Single image or video" with uploaded media**: one ad,
up to 10 images and videos, Meta picks per placement. Public docs:
[multi-media ads](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/multi-media-ads).
Builder: `buildMediaSourcingSpec` in `src/lib/meta/multiMedia.ts`.

```jsonc
{
  "object_story_spec": {
    "page_id": "…", "instagram_user_id": "…",
    // the row's FIRST asset; it must also appear in media_sourcing_spec
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
    "bodies": [{ "text": "…" }],   // primary texts 1–5
    "titles": [{ "text": "…" }]    // headlines 1–5
  },
  "degrees_of_freedom_spec": {…},
  "url_tags": "…"
}
```

**Stacks.** Ads Manager groups shapes of one creative into a stack: images
sharing a client-generated UUID `group_id`, each tagged with its
`variant_types`. We build stacks automatically:

- Shape comes from the file's **pixel dimensions** (Drive metadata):
  width/height < 0.7 → `FULLSCREEN_VERTICAL` (9:16), < 0.9 → `VERTICAL` (4:5),
  ≤ 1.1 → `SQUARE`, else `HORIZONTAL`.
- Membership comes from **file names** that match apart from a shape tag
  (`Toast_1x1` + `Toast_9x16`; also `1080x1920`, `4-5`, `square`, `story`,
  `vertical`…). A looser second pass pairs still-lone images that match apart
  from version words (`HatLady_V1` square + `HatLady_V2` 9:16); it never joins
  a stack the exact pass made and ignores numbered files and Canva `(1)`
  copies.
- One image per shape per stack. Videos never stack (Meta rejects `group_id`
  on videos). Images without dimensions stand alone.
- The publish rename writes `AdName_<stack>_<1x1|9x16|4x5|wide>`, which reads
  back into the same stacks.
- **Known mis-pair:** two different concepts named only by version
  (`X_V1` square, `X_V2` vertical) stack together. Visible on the wizard's
  confirm step.

**Limits:** 10 media, counting every shape in a stack (matches Ads Manager's
count); duplicates are dropped before the cap; every video needs a thumbnail.

**Read-back.** After creating the ad, the route reads
`creative{media_sourcing_spec}` and compares our `source: "multi_media"` items
and stack count with what it sent. Meta adds its own `related_media` /
`gen_ai` items to ads built in Ads Manager (from Ads Manager's toggles — none
appeared on API-created ads). Any shortfall becomes a warning shown as
**"Published — check"**. Earlier mixed-media write shapes were accepted and
then silently dropped videos, so read the warning.

**Verified (Oct 2026, validate-only and one real PAUSED ad):** image or video
lead, videos only, single image/video, all 14 enhancements, Instagram
identity, a 3-shape stack (1:1 + 4:5 + 9:16): all accepted and persisted
exactly; Ads Manager shows the ad as "Uploaded media" with the stack intact.
**Not yet verified:** a publish through the app itself, a wide (`HORIZONTAL`)
image in a stack, objectives other than Sales, delivery per item
(`/insights?breakdowns=media_asset` after spend).

### Flexible (`flexible`) — the previous format, kept as a fallback

`creative_asset_groups_spec`, sent with the ad:

```jsonc
{
  "creative": {
    "object_story_spec": { "page_id": "…",
      "link_data": { "link": "…", "image_hash": "<FIRST_IMAGE_HASH>" } },  // or video_data
    "url_tags": "…"
  },
  "creative_asset_groups_spec": { "groups": [{
    "images": [{ "hash": "…" }], "videos": [{ "video_id": "…" }],
    "texts": [{ "text": "…", "text_type": "primary_text" }, { "text": "…", "text_type": "headline" }],
    "call_to_action": { "type": "LEARN_MORE", "value": { "link": "…" } }
  }] }
}
```

- The image/video in `object_story_spec` **must be the group's first asset**
  ("Flexible Format Image/Video Mismatch" otherwise).
- Only `OUTCOME_SALES` and `OUTCOME_APP_PROMOTION` campaigns. The wizard
  enforces this for new campaigns, not for existing ones.
- **Meta removed this field from the read schema** (reading it errors on every
  version) but still accepts it on write and converts it — stored Flexible
  ads read back as multi-media items. It can stop working at any version
  sunset. Multi-Media is its replacement; Flexible stays available as a
  fallback.

### Carousel (`carousel`)

`object_story_spec.link_data.child_attachments`, 2–10 cards,
`multi_share_end_card: false`. Card N = asset N + headline N; a blank headline
slot stays `''` (cards never borrow a neighbour's headline). Only primary text
1 is published. Video cards use `picture` for the thumbnail. If any card's
upload fails, the whole ad fails.

### Single Image / Single Video (`single_image`, `single_video`)

Two steps: create an AdCreative with `object_story_spec` (`link_data` or
`video_data`) plus `asset_feed_spec` `{bodies, titles, optimization_type:
"DEGREES_OF_FREEDOM"}` for text variations, then the ad. **Without
`optimization_type: DEGREES_OF_FREEDOM`, `asset_feed_spec` makes the ad set
legacy Dynamic Creative, which allows only one ad.** Only the row's first asset
is published.

## Errors

- Token problems are Graph error codes **190 / 102** (`MetaGraphError`) —
  detect by code, not message text.
- The wizard turns common errors into plain language
  (`classifyPublishError` in `src/components/PublishWizard/index.tsx`); the raw
  envelope (`fbtrace_id`, `error_subcode`, `error_user_msg`, the payload) is
  in Vercel's logs.
- "Required Field Is Missing (link)" → no destination URL on the row.

## How the format changed (2026)

- **Aug 2026:** Ads Manager replaced flexible ads with "uploaded media"
  groups. `creative_asset_groups_spec` disappeared from reads; stored Flexible
  ads were rewritten as single-video creatives with DOF text variations. The
  new groups weren't visible to the API yet. Decision: keep publishing Flexible
  through the write shim and wait.
- **Sep 2026:** Meta documented multi-media ads (`media_sourcing_spec`).
- **Oct 2026:** Ads-Manager ads read back with `media_sourcing_spec`,
  stacks modelled as `group_id` + `variant_types`. The Multi-Media ad type
  was added, built to match.

The full multi-media probe write-up is in git history:
`git show 3aaf617:docs/MULTI_MEDIA_ADS.md`.

## Probing Meta yourself

`scripts/probe-multi-media.mts` runs the app's own payload builder against the
live API (Node 22.6+):

```bash
node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts <command> --from-firestore <your name>
```

- `campaigns` / `read <campaign id or name>` — read-only.
- `validate` / `matrix <campaign or ad set id> <page id> <link>` —
  `validate_only`: Meta checks the payload and **creates nothing**.
- `create …` — creates **one real PAUSED ad** named `*-DELETE-ME` and reads it
  back. Delete it in Ads Manager afterwards.

The token comes from `META_TOKEN`, or `--from-firestore` reads your stored
token with your `gcloud` login (it is never printed). Tips: with curl, pass
`-g` or `--data-urlencode` for nested `fields={…}`, or the nested fields
silently vanish; `?metadata=1` introspection is disabled on ad nodes — find
fields by trying names and reading the error.
