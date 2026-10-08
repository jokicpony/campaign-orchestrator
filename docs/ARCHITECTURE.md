# Architecture — how Campaign Orchestrator fits together

How the pieces connect, what each flow does, and the rules that keep it
working. Running it day to day (users, credentials, shipping, fixing things) is
in [OPERATIONS.md](OPERATIONS.md); Meta payload details are in
[META_API.md](META_API.md).

## The one-sentence version

A team builds Meta ads in a shared browser workspace — creative from Google
Drive, copy from past top performers and an AI co-writer — reviews them, then
publishes them to Meta through the Marketing API, always **PAUSED**.

Firestore holds the workspace (campaigns, rows, settings). Drive holds the
creative. Meta holds the published result. The app never stores image or video
files itself; at publish they go Drive → Meta server-to-server.

## The pieces

```
 Browser (Next.js app)                         Vercel (API routes)                 External
 ─────────────────────                         ───────────────────                 ────────
 Firebase Auth (Google sign-in) ──ID token──▶  requireAuth (JWT + allowlist)
 Firestore client SDK ◀──────────────────────────────────────────────────────▶  Firestore
   campaigns, settings/global, users/{uid}                                     (rules gate clients)
 Drive token (from the sign-in popup) ──────▶  /api/drive/rename,          ──▶ Google Drive
                                               /api/meta/upload/from-drive
                                               /api/meta/*  ── Meta token ────▶ Meta Graph API v25
                                                 │  read from serverSecrets via
                                                 │  Workload Identity (no key)
                                               /api/ai/generate ─────────────▶ Gemini / Claude / OpenAI
                                               /api/meta/upload (>50 MB video) ▶ Cloud Function
                                                                                 (ffmpeg → Meta)
```

| Piece | What it is | Code |
|---|---|---|
| App | Next.js 16 App Router, React 19, Tailwind 4, one page (`/`) with Build and Review modes plus a Settings modal | `src/app/page.tsx`, `src/components/` |
| API routes | Server side of everything that needs a secret: Meta, Drive renames/transfers, AI, thumbnails | `src/app/api/` |
| Firebase Auth | Google sign-in popup; also returns the Drive access token | `src/components/AuthContext.tsx` |
| Firestore | The shared workspace and settings; plus `serverSecrets`, readable only by the backend | `src/lib/firebase/`, `src/lib/server/` |
| Firebase Storage | Thumbnail cache (`thumbnails/{driveFileId}.jpg`) | `src/lib/firebase/thumbnailCache.ts` |
| Google Drive | Source of all creative; files are renamed to the ad name at publish | `src/lib/google/driveService.ts` |
| Meta Marketing API | Campaigns, ad sets, image/video upload, ads, insights. Version pinned in `src/lib/meta/constants.ts` | `src/lib/meta/`, `src/app/api/meta/` |
| Transcode function | GCP Cloud Function (gen2): streams a >50 MB video from Drive, re-encodes with ffmpeg, uploads to Meta | `functions/transcode-and-upload/` |
| AI providers | Copy generation through the Vercel AI SDK | `src/app/api/ai/`, `src/lib/ai/` |

## Who is allowed to do what

Four separate gates. Each fails closed.

1. **Who can use the API.** Every sensitive route calls `requireAuth`
   (`src/lib/server/verifyAuth.ts`): it verifies the Firebase ID token against
   Google's public keys (with `jose`, no Admin SDK), then checks the verified
   email against `AUTHORIZED_EMAILS` / `AUTHORIZED_EMAIL_DOMAINS`. In
   production, **no allowlist means every request is denied**
   (`ALLOW_ALL_AUTHENTICATED=true` admits any Google account — only for a
   deliberately open instance). The client attaches the token
   with `authedFetch` (`src/lib/api/authedFetch.ts`).
2. **Who can read Firestore from the browser.** `firestore.rules`:

   | Path | Access |
   |---|---|
   | `campaigns/{id}`, `settings/global` | any team member |
   | `users/{uid}/**` | that user only |
   | `serverSecrets/{uid}` | **no client, ever** — backend only |
   | everything else | denied |

   "Team member" (`isTeamMember()`) is a verified email matching the allowlist
   **written into the rules file** — rules can't read env vars, so the
   allowlist is repeated in `firestore.rules`, `storage.rules` and the env vars,
   and must be kept in sync by hand.
3. **Secrets never reach the browser.** Each user's Meta long-lived token
   (~60 days) and their own AI provider keys live in
   `serverSecrets/{uid}`. API routes reach it as a service account through
   **Workload Identity Federation**: Vercel's per-deployment OIDC token is
   exchanged for short-lived Google credentials
   (`src/lib/server/gcpFirestore.ts`). There is no service-account key file
   to leak or rotate. The binding covers the **production** deployment only;
   locally the code uses Application Default Credentials.
   Anyone with Owner, Editor or Firestore access on the Google Cloud project
   can also read `serverSecrets` — keep the project's IAM list as small as the
   team allowlist.
4. **Who can publish to which ad account** is Meta's decision: the app acts
   with each user's own token, so a user can only publish where their Facebook
   account has access.

Everyone who passes the allowlist can use every feature, including Settings.
There are no roles.

## What's in the database

Firestore (Native mode). Types are in `src/types/index.ts`.

| Path | Holds | Written by |
|---|---|---|
| `campaigns/{id}` | A workspace tab: `name`, `status`, `archiveStatus`, `position`, `brief` (product, context, `driveFolderUrl`), `palette` (copy library), `rows[]`, lock fields (`lockedBy`, `lockedByName`, `lockedAt`) | Client |
| `campaigns/{id}.rows[]` | One ad: `assets[]` (Drive file id, name, dimensions…), `slots` (5 primary texts, 5+ headlines), `adType`, URL, `callToAction`, `namingValues`, `generatedAdName`, `reviewStatus`, `comments[]`, `lastPublishedAt`, `metaAdId` | Client |
| `settings/global` | Team-wide settings: brand voice, kill list, products, personas, modifiers, ad-type aliases, naming templates, URL parameters, `defaultAdAccountId`, `defaultAgeMin`, AI provider/model | Client (Settings modal) |
| `users/{uid}` | Profile | Client |
| `users/{uid}/integrations/meta` | Meta connection **metadata**: ad accounts, Pages (with Instagram ids), selections, expiry. No token | Client, from the OAuth redirect |
| `serverSecrets/{uid}` | `meta.accessToken` + `expiresAt`; `providerKeys` (the user's own AI keys) | Backend only |

Browser storage: the Drive token in `localStorage` (`mco.driveToken`, 55 min)
and mirrored into a `SameSite=Strict` cookie scoped to `/api/video-proxy`.

---

## Flow 1 — Signing in and connecting

- **Sign-in** is a Firebase Google popup that also asks for the full Drive
  scope; the popup's Google access token is the **Drive token** (about an
  hour, no refresh token). When it lapses, Settings → Connections →
  Reconnect Drive opens the popup again.
- **Meta** (Settings → Connections → Connect): `startMetaOAuth` POSTs to
  `/api/auth/meta`, which sets an httpOnly uid cookie and a CSRF `state`
  cookie and returns the Facebook dialog URL. The callback
  (`/api/auth/meta/callback`) checks `state`, swaps the code for a long-lived
  token, stores it with `setMetaToken`, and redirects to
  `/?meta_connected=true#meta_data=…` — the fragment carries only ad
  accounts, Pages and expiry, and the client scrubs it from the URL. Page
  access tokens are never fetched.
- Scopes: `ads_read`, `ads_management`, `business_management`,
  `pages_read_engagement`, `pages_show_list`. **Changing the scope list means
  every user has to reconnect.**
- Routes get the token with `requireMetaToken(uid)`
  (`src/lib/server/metaAuth.ts`): **401 `TOKEN_EXPIRED`** → reconnect;
  **503 `TOKEN_STORE_UNAVAILABLE`** → Workload Identity / Firestore problem,
  reconnecting won't help. Disconnect (`DELETE /api/auth/meta`) deletes the
  stored token.

## Flow 2 — Building ads (Build Mode)

Campaign tabs across the top are shared Firestore documents. Opening one takes
a **soft lock** (10 minutes, refreshed every 2) so two people don't overwrite
each other; others see a view-only banner and their saves are refused. Edits
apply locally at once and save to Firestore after 3 seconds of quiet
(`src/app/page.tsx`).

Build Mode has four tabs and a Palette panel:

- **Assets** — paste a Drive folder URL; the app lists the images and videos
  directly in it (not subfolders), with pixel dimensions and durations from
  Drive. Thumbnails are cached in Firebase Storage.
- **AI Co-Writer** — pick a product, persona and up to two modifiers, write a
  brief, and generate headlines/primary texts. `/api/ai/generate` streams from
  the team's chosen provider using the user's own key if they set one, else
  the server's env key. Brand voice and the kill list come from
  `settings/global`; kill-listed words are also filtered out of the output.
  Accepted options go into the Palette.
- **Assembly** — the rows. Each row is one ad: assets (picked in order — the
  first asset leads), up to 5 primary texts and 5 headlines dragged in from the
  Palette, destination URL, CTA, ad type, and a name built from the naming
  template.
- **Ad Namer** — a standalone name builder (copy to clipboard only).
- **Palette** — the campaign's copy library: **Top Performers** (last 90
  days of the ad account's copy, by spend, via insights `body_asset` /
  `title_asset` breakdowns) and **Active** (copy accepted or added for this
  campaign).

Ad types (`src/types/ad-types.ts`; Settings → Ad Setup edits the naming
alias and description — saved values override the built-ins, except
`maxAssets` and `recommendedUse`):

| Type | Assets | Publishes as |
|---|---|---|
| Multi-Media | up to 10 images + videos; same-name shapes auto-stack | one ad with `media_sourcing_spec` |
| Flexible | up to 10 images + videos | `creative_asset_groups_spec` (Meta's compatibility shim) |
| Carousel | 2–10 cards; headline N pairs with card N; one primary text | `child_attachments` |
| Single Image / Single Video | picker allows 3, **only the first publishes** | `asset_feed_spec` + Advantage+ text variations |

## Flow 3 — Review

Review Mode shows each row as a large card. Reviewers leave feedback (row →
`needs_changes`), builders reply (→ `pending`), reviewers **Mark Reviewed**
(→ `reviewed`). Rows where the builder replied last sort first. Only reviewed
rows can be selected for publishing — a UI rule, not enforced server-side.

## Flow 4 — Publishing

Selecting reviewed rows in Review Mode and clicking **Publish Selected** opens
the wizard (`src/components/PublishWizard/`): four steps, then a results
screen. Each step calls API routes.

1. **Target** — a new campaign (named from the campaign naming template), or
   an existing one with an existing or new ad set.
2. **Configure** (new campaigns) — objective, optimisation goal, conversion
   event, pixel, daily budget, CBO or ad-set budget, special ad categories,
   start time. **Enhancements**: 14 Advantage+ creative toggles, all on by
   default, sent as `degrees_of_freedom_spec`.
3. **Confirm creative** — per-ad URL/CTA overrides; multi-media rows show
   their stacks.
4. **Review & publish** — checks the Meta and Drive connections, then:
   - creates the campaign and ad set if needed (`/api/meta/campaign`,
     `/api/meta/adset`) — **always PAUSED**, countries from
     `src/lib/config/deployment.ts` (`['US']` by default), `age_min` from
     Settings (fallback 18), dropped for housing/employment/financial;
   - publishes ads **three at a time** (`PUBLISH_CONCURRENCY`). Per ad, asset
     by asset:
     1. **rename** the Drive file to the ad name (`AdName.jpg` for a one-asset
        row, else `AdName_1.jpg`; multi-media `AdName_1_1x1.jpg`). This
        happens *before* Meta confirms; a failed rename is ignored and the
        publish carries on; when rows share a file, only the first row to start
        renames it;
     2. **transfer** it Drive → Meta (`/api/meta/upload/from-drive`):
        images to `/adimages` (→ hash), videos to `/advideos`; videos over
        50 MB go through the transcode Cloud Function when it's configured;
     3. **create the ad** (`/api/meta/publish/ad`): waits (up to 60 s, in
        parallel) for videos to finish processing and takes a full-size
        thumbnail, builds the creative for the ad type, and creates the ad
        PAUSED with `instagram_user_id` from the selected Page. Multi-media
        ads are read back and compared with what was sent; differences come
        back as a warning ("Published — check").
   - Stop finishes the ads already in flight and starts no more.
Then the **results** screen — per-ad success/warning/error in plain language, links to the
   campaign in Ads Manager and the Drive folder. Published rows record
   `lastPublishedAt` and `metaAdId`. Re-publishing a row creates a new ad.

Every Meta error is logged with its full envelope (`fbtrace_id`, subcode,
user message, payload) via `serializeMetaError` (`src/lib/logger.ts`); logs
are in Vercel → Logs, and each publish carries a short `sid`.

---

## Rules that keep it working

- **Everything is created PAUSED.** Campaign and ad-set routes hardcode it;
  the wizard always sends PAUSED for ads. A human turns things on in Ads
  Manager.
- **Asset order is meaning.** The first asset is an ad's lead media; carousel
  cards pair with headlines by position. The asset picker keeps click order —
  don't let anything re-sort `row.assets`.
- **Multi-media stacks come from file names and pixel sizes**, recomputed
  everywhere by `buildStacks` (`src/lib/meta/multiMedia.ts`) — never stored.
  The publish rename keeps the stack readable (`_1_1x1`, `_1_9x16`).
- **The Graph API version is pinned in three places:**
  `src/lib/meta/constants.ts` (the app), `functions/transcode-and-upload/src/index.ts`
  (redeploy the function to change it) and `scripts/probe-multi-media.mts`.
- **Saved ad-type settings are merged, not substituted:** always load them
  through `mergeAdTypes()`, or new built-in types vanish for teams whose
  settings predate them.
- **Settings are team-wide:** one `settings/global` document
  (`src/lib/firebase/firestore.ts`), saved whole — last writer wins.
  `users/{uid}` holds only a profile and the Meta connection metadata.
- **The allowlist exists three times** — env vars, `firestore.rules` and
  `storage.rules`.

## Where to look when changing…

| You're changing… | Start at |
|---|---|
| How an ad type is built for Meta | `src/app/api/meta/publish/ad/route.ts`, [META_API.md](META_API.md) |
| Multi-media stacking or naming | `src/lib/meta/multiMedia.ts`, `scripts/test-multi-media.mts` |
| The wizard's steps or defaults | `src/components/PublishWizard/` (`index.tsx` holds defaults and `publishOneAd`) |
| Campaign / ad-set fields | `src/app/api/meta/campaign/route.ts`, `src/app/api/meta/adset/route.ts`, `src/lib/config/deployment.ts` |
| Meta OAuth, scopes, token storage | `src/app/api/auth/meta/`, `src/lib/server/metaTokenStore.ts`, `metaAuth.ts` |
| Who can sign in / use the API | `src/lib/server/verifyAuth.ts`, `firestore.rules`, Vercel env |
| Drive listing, renames, transfers | `src/lib/google/driveService.ts`, `src/app/api/drive/rename/`, `src/app/api/meta/upload/from-drive/` |
| AI models and prompts | `src/types/index.ts` (`AVAILABLE_AI_MODELS`), `src/lib/ai/`, `src/app/api/ai/generate/route.ts` |
| Ad types and limits | `src/types/ad-types.ts` |
| Rows, slots, review state | `src/components/BuildMode/AssemblyLine/`, `src/components/ReviewMode/`, `src/types/index.ts` |

## Glossary

| Term | Meaning |
|---|---|
| Ad account (`act_…`) | Where Meta campaigns and spend live; chosen in Settings → Connections |
| Advantage+ enhancements | Meta's automatic creative tweaks (text variations, cropping, animation…); the wizard's 14 toggles |
| ASC / AAC | Advantage+ Shopping / App campaigns — Meta's automated campaign types, no longer creatable through the API |
| CBO | Campaign budget optimisation: the budget sits on the campaign, not the ad set |
| DOF | `degrees_of_freedom_spec` — the part of a creative that opts in to Advantage+ enhancements |
| `fbtrace_id` | Meta's id for one failed request; quote it when asking Meta support |
| `promoted_object` | What an ad set optimises for — a pixel event or a Page |
| Shim | Meta still accepting an old field (Flexible's `creative_asset_groups_spec`) and converting it |
| `sid` | The short id on every log line of one publish request |
| Stack | Shapes of one creative (1:1, 9:16…) grouped in a Multi-Media ad so Meta serves the right one per placement |
| WIF | Workload Identity Federation — how the server gets Google credentials without a key file |
