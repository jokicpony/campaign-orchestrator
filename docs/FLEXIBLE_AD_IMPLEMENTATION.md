# Meta Flexible Ad Format Implementation

> Technical documentation for the Meta Marketing API flexible ad publishing implementation.
> Last updated: July 2026

## Overview

This document details the implementation of **Flexible Ad Format** (formerly known as Dynamic Creative) for Meta ads publishing. Unlike the legacy `asset_feed_spec` approach, this uses `creative_asset_groups_spec` which allows multiple ads per ad set.

> **Scope:** this covers the **flexible** path specifically. `single_image` / `single_video` publish via `asset_feed_spec`, and `carousel` via `object_story_spec.child_attachments` — see `src/app/api/meta/publish/ad/route.ts`, which routes by `adType`. Batches publish **concurrently** via a bounded pool (`PublishWizard/index.tsx`).

## Key Discovery: Dynamic Creative vs Flexible Ad Format

| Approach | Endpoint | Limitation |
|----------|----------|------------|
| **Dynamic Creative** (`asset_feed_spec`) | `/adcreatives` | ❌ 1 ad per ad set |
| **Flexible Ad Format** (`creative_asset_groups_spec`) | `/ads` | ✅ Multiple ads per ad set |

## API Structure

### Endpoint
```
POST https://graph.facebook.com/v24.0/act_<AD_ACCOUNT_ID>/ads
```

### Payload Structure

```json
{
  "name": "Ad Name",
  "adset_id": "<ADSET_ID>",
  "status": "PAUSED",
  "creative": {
    "name": "Ad Name - Creative",
    "object_story_spec": {
      "page_id": "<PAGE_ID>",
      "link_data": {
        "link": "https://example.com",
        "image_hash": "<FIRST_IMAGE_HASH>"
      }
    },
    "url_tags": "utm_source={{site_source_name}}&utm_medium=paid"
  },
  "creative_asset_groups_spec": {
    "groups": [{
      "images": [{ "hash": "<HASH_1>" }, { "hash": "<HASH_2>" }],
      "videos": [{ "video_id": "<VIDEO_ID>" }],
      "texts": [
        { "text": "Primary text 1", "text_type": "primary_text" },
        { "text": "Headline 1", "text_type": "headline" }
      ],
      "call_to_action": {
        "type": "LEARN_MORE",
        "value": { "link": "https://example.com" }
      }
    }]
  }
}
```

## Critical Implementation Details

### 1. First Asset Must Match
The `link_data.image_hash` (or `video_id`) in `object_story_spec` **must match** the first image/video in the asset group.

**Error if mismatched:**
```
Flexible Format Image/Video Mismatch
The first image/video of the first Flexible Format asset group must match the image/video in the creative spec.
```

### 2. URL Parameters via `url_tags`
URL parameters (UTM tracking) go in the `creative.url_tags` field, **not** appended to the URL.

- ✅ `url_tags`: `"utm_source={{site_source_name}}&utm_medium=paid"`
- ❌ `link`: `"https://example.com?utm_source={{site_source_name}}"`

### 3. Text Structure
Use `texts` array with `text_type` field:
- `"primary_text"` - Ad body copy (up to 5)
- `"headline"` - Headlines (up to 5)

### 4. Campaign Objective Restrictions
Per Meta docs, Flexible Ad Format only supports:
- `OUTCOME_SALES`
- `OUTCOME_APP_PROMOTION`

## File Locations

| File | Purpose |
|------|---------|
| [route.ts](../src/app/api/meta/publish/ad/route.ts) | API route for ad publishing |
| [PublishWizard/index.tsx](../src/components/PublishWizard/index.tsx) | Frontend wizard component |

## Debugging Tips

1. Check server logs for:
   - `URL Parameters received:` - Confirms params are passed
   - `Creating Flexible Ad with creative_asset_groups_spec:` - Shows payload
   
2. Common errors:
   - **"Required Field Is Missing (link)"** → `link_data.link` missing in `object_story_spec`
   - **"Image/Video Mismatch"** → First asset doesn't match `object_story_spec`
   - **"1 ad per DC Ad Set"** → Using wrong approach (legacy `asset_feed_spec`)

## Video Support

Videos are supported via:
```json
{
  "videos": [{ "video_id": "<VIDEO_ID>" }]
}
```

If video-only ad, use `video_data` with `video_id` instead of `link_data`.

## References

- [Meta Flexible Ad Format Docs](https://developers.facebook.com/docs/marketing-api/flexible-ad-format/)
- [Ad Creative Reference](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/)
