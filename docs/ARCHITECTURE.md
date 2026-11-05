# Architecture — how Campaign Orchestrator fits together

How the pieces connect, what each flow does, and the rules that keep it
working. Running it day to day (users, credentials, shipping, fixing things) is
in [OPERATIONS.md](OPERATIONS.md); Meta payload details are in
[META_API.md](META_API.md).

## The one-sentence version

A team builds Meta ads in a shared browser workspace — creative from Google
Drive, copy from past top performers and an AI copywriter — reviews them, then
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
                                               /api/ai/copy ─ GEMINI_API_KEY ▶ Gemini
                                                 (also reads public pages
                                                  for campaign context)
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
| Gemini | The copywriter, through the Vercel AI SDK, with one team key from the server env | `src/app/api/ai/copy/`, `src/lib/ai/` |

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
   | `aiUsage/*` | no client — the backend writes it, Settings reads it through `/api/ai/usage` |
   | everything else | denied |

   "Team member" (`isTeamMember()`) is a verified email matching the allowlist
   **written into the rules files** — rules can't read env vars, so the
   allowlist is repeated in `firestore.rules`, `storage.rules` (the thumbnail
   cache: team-only, images under 5 MB) and the env vars, kept in sync by hand.
3. **Secrets never reach the browser.** Each user's Meta long-lived token
   (~60 days) lives in `serverSecrets/{uid}`; the team's Gemini key is a
   server env var (`GEMINI_API_KEY`). API routes reach it as a service account through
   **Workload Identity Federation**: Vercel's per-deployment OIDC token is
   exchanged for short-lived Google credentials
   (`src/lib/server/gcpFirestore.ts`). There is no service-account key file
   to leak or rotate. The binding covers the **production** deployment
   only; locally the code uses Application Default Credentials.
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
| `campaigns/{id}` | A workspace tab: `name`, `status`, `archiveStatus`, `position`, `brief` (`keyMessages` = the copywriter's notes, `contextLinks`, `contextPages` = the text read from those links and row landing pages, `driveFolderUrl`), `palette` (copy library), `rows[]`, lock fields (`lockedBy`, `lockedByName`, `lockedAt`) | Client |
| `campaigns/{id}.rows[]` | One ad: `assets[]` (Drive file id, name, dimensions…), `slots` (5 primary texts, 5+ headlines), `adType`, URL, `callToAction`, `namingValues`, `generatedAdName`, `reviewStatus`, `comments[]`, `lastPublishedAt`, `metaAdId` | Client |
| `settings/global` | Team-wide settings: `brandVoice`, `targetPersonas`, `killList`, ad-type aliases, naming templates, URL parameters, `defaultAdAccountId`, `defaultAgeMin` | Client (Settings modal) |
| `users/{uid}` | Profile | Client |
| `users/{uid}/integrations/meta` | Meta connection **metadata**: ad accounts, Pages (with Instagram ids), selections, expiry. No token | Client, from the OAuth redirect |
| `serverSecrets/{uid}` | `meta.accessToken` + `expiresAt` (older docs may still hold an unused `providerKeys`) | Backend only |
| `aiUsage/{day}_{model}` | One model's AI usage for one UTC day, team-wide: `kinds.{write,fill,story,page}` (calls, input, cached and output tokens, `costMicros`) and `people.{uid}` (email, calls, `costMicros`). No copy text | Backend only (`src/lib/server/aiUsage.ts`); read via `GET /api/ai/usage` |

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

Campaign tabs across the top are shared Firestore documents. A reload reopens
the campaign you last had open in that browser (or the first tab). Opening one
takes a **soft lock** (10 minutes, refreshed every 2) so two people don't overwrite
each other; others see a view-only banner and their saves are refused. Edits
apply locally at once and save to Firestore after 3 seconds of quiet
(`src/app/page.tsx`). Pending edits are saved straight away before anything
changes the open campaign (switching, adding, closing or archiving a tab) and
when the browser tab closes, which also shows the browser's "Leave site?"
prompt. Pending saves are queued per campaign (`useCampaigns`), so a save
that fails is retried on the next change into the campaign it came from.

Build Mode has three tabs and a Palette panel (which holds the copywriter):

- **Assets** — paste a Drive folder URL; the app lists the images and videos
  directly in it (not subfolders), with pixel dimensions and durations from
  Drive. Thumbnails are cached in Firebase Storage.
- **Assembly** — the rows. Each row is one ad: assets (picked in order — the
  first asset leads), up to 5 primary texts and 5 headlines (dragged in from
  the Palette or the copywriter, or typed straight into an empty slot),
  destination URL, CTA, ad type, and a name built from the naming template.
  Each copy column shows its filled slots plus one empty one (a carousel shows
  one headline per card and one primary text), so empty rows stay short.
  The name (`generatedAdName`) saves itself once the row has an angle name
  and a type, or once someone opens the naming panel; `handleUpdateRow`
  builds on `campaignRef`, so several rows saving names in one render don't
  overwrite each other. Copy typed or used in a row also joins the Palette's
  Active list.
- **Ad Namer** — a standalone name builder (copy to clipboard only).
- **Palette** — everything about copy, built around one **selected ad**
  (picked at the top of the Palette; it follows the row you click or type
  in, a row's sparkle button, and a new or duplicated row; it shows how full
  that ad's slots are). Two tabs. **Copy** switches between three
  views, one at a time at full width: **Top performers** (the default; last
  90 days of the ad account's copy via insights `body_asset` /
  `title_asset` breakdowns. **Import** sits beside the search box and can
  filter to ads whose ad or campaign name contains a product;
  `src/lib/meta/topCopy.ts` merges identical copy across ads, then keeps, per
  type, the biggest spenders that together cover 80% of that type's spend, at
  most 15, with spend-weighted ROAS. The result, or why nothing came in,
  shows under the search box), the **Copywriter**, and **Write your own**
  (`WriteYourOwn.tsx`: type a headline or primary text, then Use it in the
  selected ad; it lists the campaign's hand-written copy). **Active** lists
  the copy this campaign uses and edits it (`ActivePalette.tsx`, view logic
  in `src/lib/activePalette.ts`): copy in at least one ad on top, copy in no
  ad folded under **Unused** (two-click **Clear unused**); filters for type,
  source (Top performers, Copywriter, Yours) and **This ad**; sorts Most used,
  Newest (order it joined Active) and Top performance (spend, then ROAS);
  search from 15 cards; each card's "In 02 05" jumps to and selects that ad.
  The filters live in the Palette, so they survive tab switches. Copy joins
  Active by being used (Use, or a drop on a slot); there is no separate
  "add to Active". Every card — top performer, AI result, hand-written or Active — has
  **Use** (fills the selected ad's next
  empty slot of that type and joins Active; it reads "In ad" or "Full"
  instead when that applies, via `CopyTarget.tsx`) and **Riff on this**
  (variations for the selected ad). Cards can still be dragged onto a slot.
  Headlines are blue and primary text orange wherever copy shows (cards,
  type filters, row column labels and filled slots, Review), from
  `src/components/copyType.ts`.
  **Split** widens the Palette to half the screen (remembered per browser);
  rows narrower than 48rem move their URL and CTA under the copy (a container
  query in `AdRow`).
- **Copywriter** (`src/components/BuildMode/Copywriter/`) — one conversation
  per campaign, writing for the selected ad. It stays mounted while hidden,
  so switching tabs or collapsing the Palette keeps the conversation. You
  ask in plain words, then **Use** a result or drag it onto a slot.
  **Fill this ad** opens a "Fill with…" menu: Any angle, then the angles in
  `FILL_ANGLES` (`src/lib/ai/prompts.ts`; Riff on top performers shows only
  once Top performers are imported or the ad holds one, Something different
  only once the ad has copy). Picking one asks for exactly one piece per
  empty slot the ad will publish (`fillCounts` / `fillInstruction`, capped
  like a normal ask), each piece different in angle, format and length
  (`fillVariety`; lengths stay within the limits, unless the direction sets
  the length), with the angle plus anything typed in the box as its
  direction, and puts the results in those slots in order, skipping copy
  already in the ad. It waits until the ad has a type, since the type
  decides how many slots publish. **Long-form story** (under Fill, and a
  pill beside it later) is its own path: it asks for the story in the box
  ("Write story"), then writes one story-driven long read as primary text
  (`longFormInstruction`) for you to Use; Fill never writes long-form.
  Follow-ups: Fill this ad (the same menu), Long-form story, Wilder, Safer,
  Shorter, More like top performers.

  The campaign's **Campaign Context** (the button next to Add Row on the Assembly
  Line, `src/components/BuildMode/CampaignContext.tsx`; the copywriter's
  Context links open it there) holds up to 5 links and free-text notes per
  campaign (and can copy them from another campaign); the server reads each
  link once (`POST /api/ai/copy` `pages`) and the campaign stores the result
  in `brief.contextPages`. The row's landing page is read the same way on its
  first write.

  Reading a page: `htmlToPageText` (`src/lib/ai/pageText.ts`) keeps `<main>`
  when there is one (otherwise drops the header, cart and newsletter chrome),
  pulls JSON-LD Product/ProductGroup facts (price, options, rating) and strips
  button and carousel leftovers, up to 30,000 characters. Pages of 1,500+
  characters then go to a Flash model (`gemini-3.8-flash`, or
  `GEMINI_SUMMARY_MODEL`), which names the page type (product, collection,
  brand/about, sale or landing, article, reviews, other) and writes a fact
  sheet with only the sections that fit, numbers and quotes kept exact. The
  sheet is stored as the page's `text` with `summarized: true` — once per
  page, never per write. If the summary fails the cleaned text is stored
  instead (capped at 6,000 characters). Context shows each page's text.

  Google links (`src/lib/server/googleLinks.ts`) open JavaScript viewers, so
  the server reads the file behind them: Docs and Slides as plain text,
  Sheets as CSV (the linked tab), Drive files as a download. A PDF (from
  Drive or any site, told by its first bytes; up to 14 MB, 15 s) goes to the
  same Flash model as a file and gets the same fact sheet; with no sheet
  there's no text to fall back on, so the link shows an error. Only files
  shared as "Anyone with the link" work (others end on Google's sign-in
  page); folders are refused.

  `/api/ai/copy` `write` streams from Gemini with the team key. The prompt
  is ordered so that Gemini's implicit cache can reuse it: system (rules,
  brand voice, target personas, kill list), then the campaign context
  (notes, the top 12 performers by spend, link pages inside `<page>` tags,
  which the rules say are data, not instructions), then the recent
  conversation, then the row (its winners, other copy, landing page unless
  it's already a Context link) and the ask last. The rules ask for primary
  text of 125 characters or fewer (what the Review preview shows before
  "See more") unless the ask wants longer copy, never over 2,000; a
  long-form story is a story-driven read of 800 to 2,000 characters with
  the hook in the first 125. Rows give primary text past 125 a quiet note
  ("N chars · See more", or "Long read" from 500) and flag it red only past
  Meta's 2,200 maximum (`META_CHAR_LIMITS`). Rows and Review keep the
  copy's line breaks.
  Kill-listed words are also filtered out of the output. The model
  is `gemini-4-argon` unless `GEMINI_MODEL` overrides it; if that model 404s
  the route falls back to `gemini-3.8-flash` and Settings → Copywriter says so.

  **Usage.** Every copy call and page summary adds its tokens to that day's
  `aiUsage` document for its model (`recordAiUsage`: increments, at most 3 s,
  never fails the request), with an estimated cost at that day's list price
  (`src/lib/ai/usage.ts`, which holds Argon's and Flash's dated prices).
  Settings → Usage shows the last 7 or 30 days for the whole team: by model,
  by use (asks, Fill, long-form, page summaries), cache share, and by person.
  Local dev with ADC writes to the same Firestore, so local calls count too.

  Page reading (`src/lib/server/safeFetch.ts`) accepts any public http(s) URL
  on ports 80/443 and refuses private, loopback, link-local and metadata
  addresses, checked on the address actually connected to and again on every
  redirect (max 3), with a 5 s / 1 MB / HTML-or-text limit.

Ad types (`src/types/ad-types.ts`; Settings → Ad Setup edits the naming
alias and description — saved values override the built-ins, except
`maxAssets` and `recommendedUse`):

| Type | Assets | Publishes as |
|---|---|---|
| Multi-Media | up to 10 images + videos; same-name shapes auto-stack | one ad with `media_sourcing_spec` |
| Carousel | 2–10 cards; headline N pairs with card N; one primary text | `child_attachments` |
| Single Image / Single Video | one asset; a row holding more (saved before Nov 2026, or switched from another type) publishes only the first and says so | `asset_feed_spec` + Advantage+ text variations |

Flexible (`creative_asset_groups_spec`) was retired in Nov 2026 once
Multi-Media had proven itself in real publishes. Rows saved as Flexible open
as Multi-Media (`retireFlexible`, applied when campaigns are read in
`src/lib/firebase/firestore.ts`), a row with no type fails in the wizard
instead of falling back to Flexible, and the publish route answers 400 to
`flexible`.

## Flow 3 — Review

Review Mode shows each row as a large card. On screens 1280px and wider it
has two columns: a feed-style preview on the left (`ReviewMode/AdPreview.tsx`:
primary text cut at about 125 characters behind "See more", the selected
asset, then the domain, headline and the row's CTA; carousels show the
selected card with its own headline, other types step through the primary
text and headline mixes), with asset navigation and multi-media stacks
under it; the ad name, every copy option, the URL, comments and Mark
Reviewed on the right. Narrower screens stack the two. Reviewers leave feedback (row →
`needs_changes`), builders reply (→ `pending`), reviewers **Mark Reviewed**
(→ `reviewed`). Rows where the builder replied last sort first. Only reviewed
rows can be selected for publishing — a UI rule, not enforced server-side.

## Flow 4 — Publishing

In Review Mode, **Publish N reviewed** in the header (every reviewed row
without `lastPublishedAt`), or selecting reviewed rows in Overview and
clicking **Publish Selected**, opens the wizard (`src/components/PublishWizard/`): four steps, then a results
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

- **Everything is created PAUSED.** The campaign, ad-set and ad routes all
  hardcode it, whatever the request says. A human turns things on in Ads
  Manager.
- **Ids from the browser are checked before they go into a URL.** Ad account,
  campaign, ad set and video ids must look like Meta ids, and Drive file ids
  like Drive ids (`src/lib/server/ids.ts`), so a crafted id can't point a
  server call made with someone's Meta token at another Graph endpoint.
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
| The copywriter (model, prompt, page reading) | `src/lib/ai/gemini.ts`, `src/lib/ai/prompts.ts`, `src/app/api/ai/copy/route.ts`, `src/lib/server/safeFetch.ts`, `scripts/test-copywriter.mts` |
| Which imported Top performers are kept | `src/lib/meta/topCopy.ts`, `scripts/test-top-performers.mts`, `src/app/api/meta/top-performers/route.ts` |
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
| Shim | Meta still accepting an old field and converting it (the retired Flexible type relied on `creative_asset_groups_spec`) |
| `sid` | The short id on every log line of one publish request |
| Stack | Shapes of one creative (1:1, 9:16…) grouped in a Multi-Media ad so Meta serves the right one per placement |
| WIF | Workload Identity Federation — how the server gets Google credentials without a key file |
