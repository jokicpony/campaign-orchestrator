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
- **Meta and AI can only be exercised on a production deployment.**
  Workload Identity only works there, so Meta calls (503) and AI generation
  fail on previews, and locally unless your ADC can read Firestore.
  Everything publishes PAUSED, so a test publish is safe; say what to check in
  Ads Manager afterwards.
- **Meta is the fragile part.** Log the full error envelope
  (`serializeMetaError`), prefer `validate_only` probes
  (`scripts/probe-multi-media.mts`) before changing a payload, and read back
  what Meta stored when it matters.
- **Never weaken the security model**: the Meta token and AI provider keys
  never reach the browser, request bodies from the browser, or client-readable
  Firestore docs (the server may pass the Meta token on to the transcode
  function); no service-account key files; gates fail closed. The Drive token
  is different by design — it comes from the sign-in popup, lives in the
  browser, and is sent to the Drive routes as `googleAccessToken`.
- **Built for a small, trusted team.** Fix bugs and real UX pain; don't add
  roles, multi-tenant features or new infrastructure without a concrete need.
- **No deployment-specific values in code** beyond `src/lib/config/deployment.ts`
  and the allowlist in `firestore.rules` — no company names, IDs or emails.
- **Keep the docs true.** If a change alters behaviour described in the
  README, `docs/` or here, update them in the same commit. New hard-won lessons
  go in Gotchas below.
- Commit subjects: `feat:`, `fix:`, `ui:`, `refactor:`, `docs:`, `chore:`,
  under 72 characters.

## Tech Stack

Next.js 16 (App Router) + React 19, TypeScript strict, Tailwind CSS 4, Framer
Motion, Firebase client SDK (Auth, Firestore, Storage — no Admin SDK), Google
Drive API v3, Meta Graph API v25, Vercel AI SDK (Gemini, Anthropic, OpenAI),
hosted on Vercel; one GCP Cloud Function for large-video transcoding.

## Directory Structure

```
src/
  app/
    page.tsx       — the whole app shell: campaign tabs, Build/Review, autosave
    api/           — server routes: meta/*, auth/meta, ai/*, drive/rename,
                     thumbnail*, video-proxy
  components/
    BuildMode/     — AssemblyLine (rows), AssetLibrary (Drive), Brain (AI), Palette
    ReviewMode/    — review cards and comment threads
    PublishWizard/ — the 4-step publish flow + results; index.tsx holds publishOneAd
    Settings/      — the Settings modal tabs
    MediaStacks.tsx — multi-media stack visual
  lib/
    meta/          — Graph client, constants (API version), multiMedia (stacks + payload)
    server/        — verifyAuth, metaAuth, metaTokenStore, providerKeyStore, gcpFirestore
    firebase/      — client Firestore + settings + thumbnail cache
    google/        — Drive listing and helpers
    ai/            — prompt building and stream parsing
    config/        — deployment.ts (age floor, countries)
  types/           — index.ts (rows, settings, AI models), ad-types.ts
functions/transcode-and-upload/ — Cloud Function (deployed separately with deploy.sh)
scripts/           — test-multi-media.mts (npm test), probe-multi-media.mts (live Meta probe)
firestore.rules, storage.rules — client access rules + team allowlist (deploy by hand)
```

## Key Patterns

- **Server routes authenticate with `requireAuth`** (Firebase ID token +
  allowlist) and get the Meta token with `requireMetaToken(uid)`. The client
  calls them through `authedFetch`. Never accept a Meta token or AI key from
  a request body.
- **Team settings are one Firestore document**, `settings/global`, loaded by
  `useGlobalSettings` and saved whole from the Settings modal.
- **Rows live inside the campaign document** (`campaigns/{id}.rows[]`);
  `page.tsx` debounces saves (3 s).
- **No external state management** — React hooks and props.

## Commands

```bash
npm run dev     # dev server (http://localhost:3000)
npm run build   # production build
npm run lint    # ESLint
npm test        # offline checks for multi-media stacking + payload (Node 22.6+)
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
- **Reads don't show what you wrote.** `creative_asset_groups_spec` (Flexible)
  is write-only now; stored Flexible ads read back as multi-media items. Use a
  targeted read-back (as multi-media does), not a creative dump, to verify.
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
- **Single Image/Video publish only the first asset** even though rows accept 3.
- **Shared Drives need `supportsAllDrives=true`** on every Drive call.
- **`maxDuration = 300`** on the publish and upload routes needs Vercel Pro.
- **Stop mid-publish** finishes ads in flight; campaigns and ad sets already
  created stay in Meta.

### Firebase, auth and settings

- **Workload Identity is production-only.** 401 `TOKEN_EXPIRED` means
  reconnect Meta; 503 `TOKEN_STORE_UNAVAILABLE` means WIF/Firestore is
  unreachable — don't tell the user to reconnect. AI generation reads
  `serverSecrets` too (the user's own key first), so it fails in the same
  places. Locally, leave the `GCP_*` env vars unset so ADC is used.
- **The allowlist lives three times**: env vars (`AUTHORIZED_*`),
  `firestore.rules` and `storage.rules`. An empty allowlist denies everything
  in production. Rules deploy by hand (`firebase.json` points the CLI at both
  files). Removing a person means disabling their Firebase Auth user — a domain
  allowlist alone can't.
- **`/api/auth/meta` is POST-only** — start OAuth with `startMetaOAuth()`.
- **`NEXT_PUBLIC_*` values are baked in at build** — redeploy after changing.
- **Ad-type settings must go through `mergeAdTypes()`**; a saved list used to
  replace the defaults and hid new types (Carousel went missing that way).
- **All settings are team-wide** (`settings/global`, `src/lib/firebase/firestore.ts`).
  `firestore.rules` still mentions `users/{uid}/settings/global`, but nothing
  uses it; `users/{uid}` holds only a profile and the Meta connection metadata.
- **`tsconfig.json` excludes `functions/` and `scripts/`** — including them
  breaks the Vercel build.
- **`video-proxy`** authenticates with the Strict `mco_drive_token` cookie and
  rejects cross-site `Sec-Fetch-Site` only when the header is present (older
  Safari omits it).

### AI

- **Some models reject `temperature`** (newer Claude and GPT-5 models): the
  model entry's `supportsTemperature: false` makes the route omit it.
- **Model ids go stale** — preview models get shut down, old ids 404. They're
  listed in `AVAILABLE_AI_MODELS` (`src/types/index.ts`).
- **Stream parsing must buffer across reads**, or output is silently
  truncated. Options are split on `---`.
- **The kill list is enforced on the output**, not just in the prompt.
