# Campaign Orchestrator — Project Conventions

A Next.js app where a team builds Meta ads from Google Drive creative and
AI-assisted copy, reviews them, and publishes them through the Meta Marketing
API — always PAUSED. Firestore is the shared workspace; secrets stay
server-side. Each deployment is one team's own instance (see docs/SETUP.md).

## Start here

- `docs/ARCHITECTURE.md` — the pieces, who can do what, the data model, and
  the build → review → publish flows. Read it before changing
  `src/app/api/`, `src/lib/server/` or `src/components/PublishWizard/`.
- `docs/META_API.md` — what each ad type sends to Meta and the rules Meta
  enforces. Read it before touching `src/app/api/meta/` or `src/lib/meta/`.
- `docs/OPERATIONS.md` — users, credentials, upgrading, troubleshooting, known
  issues, and design decisions (read those before proposing to undo one).
- `CONTRIBUTING.md` — what to run before a pull request.

## Working on this project

- **Before committing:** `npm run lint`, `npx tsc --noEmit`, `npm test` and
  `npm run build` (there's no CI). One concern per pull request.
- **Meta calls can only be exercised on a production deployment.** Workload
  Identity only works there, so Meta calls (503) fail on previews, and locally unless your
  ADC can read Firestore. The copywriter needs only `GEMINI_API_KEY`, so it
  works anywhere the key is set.
  Everything publishes PAUSED, so a test publish is safe; say what to check in
  Ads Manager afterwards.
- **Meta is the fragile part.** Log the full error envelope
  (`serializeMetaError`), prefer `validate_only` probes
  (`scripts/probe-multi-media.mts`) before changing a payload, and read back
  what Meta stored when it matters.
- **Never weaken the security model**: the Meta token and the Gemini key
  never reach the browser, request bodies from the browser, or client-readable
  Firestore docs (the server may pass the Meta token on to the transcode
  function); no service-account key files; gates fail closed. The Drive token
  is different by design — it comes from the sign-in popup, lives in the
  browser, and is sent to the Drive routes as `googleAccessToken`.
- **Built for a small, trusted team.** Fix bugs and real UX pain; don't add
  roles, multi-tenant features or new infrastructure without a concrete need.
- **No deployment-specific values in code** beyond `src/lib/config/deployment.ts`
  and the allowlists in `firestore.rules` / `storage.rules` — no company names,
  IDs or emails.
- **Keep the docs true.** If a change alters behaviour described in the
  README, `docs/` or here, update them in the same commit. New hard-won lessons
  go in Gotchas below.
- Commit subjects: `feat:`, `fix:`, `ui:`, `refactor:`, `docs:`, `chore:`,
  under 72 characters.

## Tech Stack

Next.js 16 (App Router) + React 19, TypeScript strict, Tailwind CSS 4, Framer
Motion, Firebase client SDK (Auth, Firestore, Storage — no Admin SDK), Google
Drive API v3, Meta Graph API v25, Vercel AI SDK (Gemini only, one team key),
hosted on Vercel; one GCP Cloud Function for large-video transcoding.

## Directory Structure

```
src/
  app/
    page.tsx       — the whole app shell: campaign tabs, Build/Review, autosave
    api/           — server routes: meta/*, auth/meta, ai/*, drive/rename,
                     thumbnail*, video-proxy
  components/
    BuildMode/     — AssemblyLine (rows), CampaignContext (links + notes, beside Add Row), AssetLibrary (Drive), Palette (selected ad; Copy = Top performers | Copywriter | Write your own; Active), CopyTarget (Use)
    ReviewMode/    — review cards and comment threads
    PublishWizard/ — the 4-step publish flow + results; index.tsx holds publishOneAd
    Settings/      — the Settings modal tabs
    MediaStacks.tsx — multi-media stack visual
    copyType.ts    — headline (blue) / primary text (orange) colors, used everywhere copy shows
  lib/
    meta/          — Graph client, constants (API version), multiMedia (stacks + payload),
                     topCopy (which imported Top performers to keep)
    server/        — verifyAuth, metaAuth, metaTokenStore, gcpFirestore, safeFetch (public pages only), ids, aiUsage
    firebase/      — client Firestore + settings + thumbnail cache
    google/        — Drive listing and helpers
    ai/            — Gemini model, prompts, page text, row context, client stream, usage (prices, cost)
    config/        — deployment.ts (age floor, countries)
    activePalette.ts — Active's usage per ad, In use / Unused split, filters and sorts
  types/           — index.ts (rows, settings), copywriter.ts, ad-types.ts
functions/transcode-and-upload/ — Cloud Function (deployed separately with deploy.sh)
scripts/           — test-multi-media.mts, test-copywriter.mts, test-top-performers.mts,
                     test-request-ids.mts, test-active-palette.mts (npm test),
                     probe-multi-media.mts (live Meta probe)
firestore.rules    — client access rules + team allowlist (deploy by hand)
storage.rules      — thumbnail-cache rules, same allowlist (deploy by hand)
```

## Key Patterns

- **Server routes authenticate with `requireAuth`** (Firebase ID token +
  allowlist) and get the Meta token with `requireMetaToken(uid)`. The client
  calls them through `authedFetch`. Never accept a Meta token or AI key from
  a request body.
- **Team settings are one Firestore document**, `settings/global`, loaded by
  `useGlobalSettings` and saved whole from the Settings modal.
- **Rows live inside the campaign document** (`campaigns/{id}.rows[]`);
  `page.tsx` debounces saves (3 s). `updateCampaign` writes to whichever
  campaign is active, so call `flushPendingSave()` before anything that
  changes the active campaign.
- **Ids from the browser go through `isMetaId` / `isDriveFileId`**
  (`src/lib/server/ids.ts`) before they're put into a Graph or Drive URL path.
- **No external state management** — React hooks and props.

## Commands

```bash
npm run dev     # dev server (http://localhost:3000)
npm run build   # production build
npm run lint    # ESLint
npm test        # offline checks: multi-media, copywriter, top performers, request ids, Active Palette (Node 22.6+)
npx firebase-tools deploy --only firestore:rules,storage --project <your-project-id>
node --experimental-strip-types --no-warnings scripts/probe-multi-media.mts <cmd> --from-firestore <name>
                # live Meta probe — validate/matrix create nothing; create makes one PAUSED ad
bash functions/transcode-and-upload/deploy.sh   # redeploy the Cloud Function
```

## Gotchas

Things that aren't obvious from the code but cost time when forgotten.

### Meta

- **"ASC" is a standard `OUTCOME_SALES` campaign.** API creation of ASC/AAC was
  removed in v25; don't re-add `smart_promotion_type`.
- **`asset_feed_spec` needs `optimization_type: DEGREES_OF_FREEDOM`**, or the
  ad set turns into legacy Dynamic Creative (one ad per ad set).
- **Reads don't show what you wrote.** Stored ads from the retired Flexible
  type (`creative_asset_groups_spec`, write-only) read back as multi-media
  items. Use a targeted read-back (as multi-media does), not a creative dump,
  to verify.
- **Flexible is retired** (Nov 2026). Don't re-add it: Multi-Media replaced it,
  saved Flexible rows open as Multi-Media (`retireFlexible`), and the publish
  route rejects `flexible`.
- **Multi-media:** max 10 media counting every stack member; the primary must
  appear in both `object_story_spec` and `media_sourcing_spec`; videos can't
  carry `group_id`; every video needs `thumbnail_url`; Meta may add its own
  `related_media`/`gen_ai` items, so compare only `source: "multi_media"`.
- **Videos must finish processing** before an ad can use them — the route
  polls every video in parallel. A video's `picture` is 160×160; use the
  preferred one from `/{video}/thumbnails`.
- **Instagram identity** = the selected Page's `instagram_business_account.id`
  as `instagram_user_id`. Not `/instagram_accounts`, not `ig_id`.
- **Detect token errors by code** (190/102 via `MetaGraphError`), not message
  text.
- **Changing OAuth scopes forces every user to reconnect Meta.**
- **The Graph version is pinned twice**: `src/lib/meta/constants.ts` and
  `functions/transcode-and-upload/src/index.ts` (the function only changes on
  redeploy). `scripts/probe-multi-media.mts` has a third copy.
- **With CBO, the ad set must have no budget and no `bid_strategy`**; without
  CBO the campaign needs `is_adset_budget_sharing_enabled`.
- **Housing/employment/financial** ad sets omit age/gender and send
  `targeting_automation.advantage_audience`.
- **curl probes:** pass `-g` or `--data-urlencode` for nested `fields={…}`, or
  the nested fields silently vanish.

### Publishing and Drive

- **Asset order is meaning**: the first asset leads the ad; carousel card N
  pairs with headline N (blank slots stay `''`, never compacted). The picker
  keeps click order — don't sort `row.assets`.
- **Drive renames happen before Meta confirms.** The extension comes from the
  real Drive name (`originalName`). When several rows in a batch share a file,
  only the first row to start renames it (`renameClaims`).
- **Multi-media stacks are recomputed from names and pixel sizes**
  (`buildStacks`), never stored. The rename (`AdName_1_1x1`) is designed to read
  back into the same stacks. Drive dimensions ignore EXIF rotation.
- **Single Image/Video take one asset**, but a row switched from another type
  (or saved before Nov 2026) keeps its extras, and only the first publishes
  (`publishedAssets`). Changing type never drops assets.
- **Shared Drives need `supportsAllDrives=true`** on every Drive call.
- **`maxDuration = 300`** on the publish and upload routes needs Vercel Pro.
- **Stop mid-publish** finishes ads in flight; campaigns and ad sets already
  created stay in Meta.

### Firebase, auth and settings

- **Workload Identity is production-only.** 401 `TOKEN_EXPIRED` means
  reconnect Meta; 503 `TOKEN_STORE_UNAVAILABLE` means WIF/Firestore is
  unreachable — don't tell the user to reconnect. Locally, leave the WIF
  vars unset so ADC is used, but set `GCP_PROJECT_ID` (ADC otherwise uses
  gcloud's default project and the token store 503s). Meta login from
  localhost is "URL blocked" unless the Meta app lists the localhost
  callback; connecting on the deployed site works, as the token store is shared.
- **The allowlist lives three times**: env vars (`AUTHORIZED_*`),
  `firestore.rules` and `storage.rules`. An empty allowlist denies everything
  in production. Rules deploy by hand (`firebase.json` points the CLI at both
  files). Check the deployed version in the Firebase console, not just the
  repo — undeployed Storage rules leave `thumbnails/` open.
  Removing a person means disabling their Firebase Auth user — the domain
  allowlist alone can't.
- **`/api/auth/meta` is POST-only** — start OAuth with `startMetaOAuth()`.
- **`NEXT_PUBLIC_*` values are baked in at build** — redeploy after changing.
- **Ad-type settings must go through `mergeAdTypes()`**; a saved list used to
  replace the defaults and hid new types (Carousel went missing that way).
- **All settings are team-wide** (`settings/global`, `src/lib/firebase/firestore.ts`).
  `firestore.rules` still mentions `users/{uid}/settings/global`, but nothing
  uses it; `users/{uid}` holds only a profile and the Meta connection metadata.
- **Firestore reads wait for sign-in.** Firebase restores auth asynchronously,
  so a read at mount is denied ("Missing or insufficient permissions") even for
  a signed-in user. `useGlobalSettings` loads per uid; until Nov 2026 it read
  at mount, never retried, and the copywriter wrote without the brand voice,
  personas or kill list.
- **Firebase pins an old `@grpc/grpc-js`**, even in 13.x; `overrides` in
  `package.json` lift it (and `google-gax`'s unused `rimraf`/`glob`). Never
  `npm audit fix --force`: it downgrades Firebase to 9. See
  `docs/OPERATIONS.md` → "Will need attention eventually".
- **`tsconfig.json` excludes `functions/` and `scripts/`** — including them
  breaks the Vercel build.
- **`video-proxy`** authenticates with the Strict `mco_drive_token` cookie and
  rejects cross-site `Sec-Fetch-Site` only when the header is present (older
  Safari omits it).

### AI

- **Gemini only, no temperature.** Gemini 3+ ignores temperature; steer with
  words. Thinking is set to `low` (`thinkingOptionsFor`); the route retries
  without it on a 400.
- **Model ids go stale** — preview models get shut down, old ids 404. The
  default and fallback are in `src/lib/ai/gemini.ts`; `GEMINI_MODEL` overrides
  without a code change, and Settings → Copywriter lists what the key can use.
- **Keep the prompt prefix stable** — Gemini's implicit cache only reuses an
  identical prefix: system, then campaign context, then history, row last.
  Anything that changes per row or per ask goes in the last message
  (`buildMessages`; a test checks this). Argon's implicit cache (95% off,
  no explicit caches) only applies to requests of 4,096+ tokens, so a small
  campaign's writes aren't cached at all; a Fill is still under 1¢. Don't pad
  prompts to reach it. Argon's price doubles on 1 Dec 2026 ($4/$20 per 1M).
- **Settings → Usage costs come from `src/lib/ai/usage.ts`**, a dated price
  list taken from Google's pricing page; update it when Google changes
  prices or the model changes (an unknown model counts tokens but shows no
  cost). Usage is recorded server-side per UTC day in `aiUsage` (no rules
  change: the catch-all denies clients), and local dev counts too.
- **Read `fullStream`, not `textStream`** — `textStream` drops error parts, so
  a failed call looks like an empty answer.
- **Stream parsing must buffer across reads**, or output is silently
  truncated. Options are split on `---`. Gemini sometimes puts a stray token
  or markdown before a tag (`默*[P]`), so `tagOf` allows a few characters
  first; a long-form story with no tag at all is kept whole. Keep blank lines
  inside a piece (paragraphs) and `whitespace-pre-wrap` wherever copy shows.
- **Context pages go through `fetchPublicPage`** (`safeFetch.ts`): it checks
  the address actually connected to, on every redirect. Don't swap it for a
  plain `fetch` — that would let a link reach internal addresses.
- **The kill list is enforced on the output**, not just in the prompt.
- **Length rules must agree**: the prompt's primary text lengths (`RULES` and
  `fillVariety` in `prompts.ts`: 125 by default, long-form 800–2,000), the
  row's quiet past-125 note and red past 2,200 (`META_CHAR_LIMITS`), and the
  Review preview's "See more" cut. Until Nov 2026 the prompt asked for
  125–250, so every Fill landed in the warning; a vague "some fuller" did the
  same. Long-form is its own path (Long-form
  story, one read from a story the person gives); Fill never writes it.
- **Pages are summarized once, when read** — a Flash model turns each page
  into a fact sheet stored as its `text` (`summarized: true`); never per
  write. Page text always sits inside `<page>` tags as data, and a page can't
  close the tag early (`buildPageDigestPrompt`, `buildCampaignContextMessage`).
- **Google share links are viewers, not content.** Drive/Docs links are
  rewritten to their export or download address (`googleLinks.ts`) before
  `fetchPublicPage`; a PDF is summarized by Flash as a file, so it has no
  plain-text fallback. Sandboxed agent environments often can't reach
  Google hosts, so test these links locally or on a deployment.
- **Shopify stores answer scripted reads with a bot check (403)** after a
  burst of requests. Don't hammer a store while testing; wait a few minutes.
