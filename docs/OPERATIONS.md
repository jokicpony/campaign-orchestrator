# Operations — running your instance

Once [SETUP.md](SETUP.md) is done, the app needs little hands-on work.
Attention is needed when someone joins or leaves, when tokens expire, and when
Meta changes its API. How the system works is in
[ARCHITECTURE.md](ARCHITECTURE.md).

Where things are in the app: **Settings** opens from your avatar menu (top
right). Its tabs: Connections, Ad Setup, Archived, Brand Voice, Products,
Personas, Modifiers. Build/Review is the toggle in the header; publishing
starts from Review Mode (**Publish Selected**).

## Users

Three separate things decide what a person can do:

1. **The team allowlist — whether they can use the app.** It exists in three
   places that must match:
   - Vercel environment variables `AUTHORIZED_EMAIL_DOMAINS` /
     `AUTHORIZED_EMAILS` (comma-separated) gate the API. Redeploy after
     changing them.
   - `firestore.rules` and `storage.rules` → `isTeamMember()` gate the
     database and the thumbnail cache. Edit both, commit and run
     `npx firebase-tools deploy --only firestore:rules,storage --project <project-id>`.
2. **Google Drive** — they see only the Drive folders their own Google account
   can open. (If your OAuth audience is External/Testing, they must also be a
   test user.)
3. **Meta** — they connect their own Facebook account in Settings →
   Connections and can publish only where that account has access in your
   business portfolio. While your Meta app is in Development mode they also
   need an app role.

To **remove** someone, **disable or delete them in Firebase console →
Authentication → Users** — that ends their sessions. Editing the allowlist (or
suspending their Workspace account) alone doesn't: a signed-in browser keeps
getting fresh Firebase tokens, and a domain allowlist can't exclude one person.
Then delete their `serverSecrets/{uid}` document (their stored Meta token and
AI keys), take any individual address off the allowlists, and remove their
business-portfolio access.

## Credentials to keep alive

- **Meta user tokens** last about 60 days; users reconnect when the app asks.
- **The Drive token** lasts about an hour (no refresh token); Settings →
  Connections → Reconnect Drive.
- **AI keys** in Vercel, and **`META_APP_SECRET`** — if you rotate one, update
  Vercel and redeploy.
- **`TRANSCODE_API_KEY`** lives in two places (the function's secret and
  Vercel). Rotate both together; until they match, only videos over 50 MB fail.
- **Admin access:** make sure more than one person can administer the Vercel
  project, the Google Cloud project, the Meta app and the business portfolio —
  and no one else has Owner/Editor on the Google Cloud project, since that
  role can read every stored token.
  A Meta app owned by one person's developer account stops being manageable
  when they leave — attach it to the business portfolio.

After changing any environment variable, **redeploy** (Vercel → Deployments →
⋯ → Redeploy): running deployments keep the old values, and `NEXT_PUBLIC_*`
values are baked in at build.

## Upgrading

Pull the latest code into your copy, run
`npm run lint && npx tsc --noEmit && npm test && npm run build`, and push to
deploy. Then check the commits you pulled for:

- `firestore.rules` / `storage.rules` changes → redeploy the rules (keep your
  allowlist);
- OAuth scope changes (`src/app/api/auth/meta/route.ts`) → every user
  reconnects Meta;
- `functions/transcode-and-upload/` changes → redeploy the function;
- a Graph API version bump (`src/lib/meta/constants.ts`) → also redeploy the
  function, which pins its own copy
  (`functions/transcode-and-upload/src/index.ts`).

**Testing:** Workload Identity works only on the production deployment, so
Meta features (503) and AI generation fail on previews, and locally unless your
ADC can read Firestore. Everything publishes
**paused**, so testing in production is safe: publish to a test campaign,
check it in Ads Manager, delete it.

## When something breaks

Start with the error the app shows — the publish results screen translates
Meta's errors into plain language. For detail, open your hosting logs
(Vercel → Logs): publish logs carry a short `sid`, and every Meta failure logs
the full error envelope (`fbtrace_id`, `error_user_msg`, the payload sent). Vercel keeps runtime logs
only briefly (about a day on Pro), so copy what you need straight away.

**"Reconnect Meta" / 401 `TOKEN_EXPIRED`.** The user's Meta token expired or was
never stored. Settings → Connections → Connect Meta.

**503 `TOKEN_STORE_UNAVAILABLE` on every Meta action** (and AI generation
failing too). The server can't reach `serverSecrets`; reconnecting won't help.
Check the five `GCP_*` variables (all must be set — a partial set is refused), that
Vercel's OIDC Federation is on (Team mode), and that the Workload Identity
provider and binding use your current Vercel team slug and project name
(renaming either breaks them). On preview deployments and locally this is
expected.

**Every API call returns 403.** The user isn't on the allowlist, or the
`AUTHORIZED_*` variables are missing (an empty allowlist denies everyone in
production; `ALLOW_ALL_AUTHENTICATED=true` admits any signed-in Google
account — only for a deliberately open instance).

**Campaigns or settings won't load / "permission denied".** The user isn't in
`firestore.rules` `isTeamMember()`, or the rules weren't deployed after an edit.

**Drive calls fail with "API has not been used in project".** Enable the Google
Drive API on the project (`gcloud services enable drive.googleapis.com`).

**Sign-in popup fails.** Your domain isn't in Firebase Authentication →
Authorized domains, or the user isn't allowed by your OAuth audience.

**Meta connect fails with a redirect error.** `META_REDIRECT_URI` must exactly
match a Valid OAuth Redirect URI in the Meta app.

**Drive assets don't load / "Connect Drive to preview".** The Drive token
expired; Settings → Connections → Reconnect Drive.

**A video "failed processing".** Meta couldn't process the file; re-export and
re-upload it. Videos over 50 MB failing with 401 → `TRANSCODE_API_KEY`
mismatch between Vercel and the function.

**"Published — check" (amber).** A Multi-Media ad was created, but the read-back
found fewer media or stacks than were sent. Open the warning, then the ad's
"Uploaded media" in Ads Manager.

**A Meta error about a field or format.** Meta probably changed something. Look
the error up in the
[Marketing API changelog](https://developers.facebook.com/docs/graph-api/changelog/)
and reproduce it with `scripts/probe-multi-media.mts validate`
([META_API.md](META_API.md#probing-meta-yourself)).

**Stopped or failed partway.** Campaigns and ad sets created before the failure
stay in Ads Manager (paused), and Drive files may already be renamed.
Re-publishing a row creates a new ad.

**AI generation fails.** "No API key configured" → add a server key or a
personal key (Settings → Brand Voice). A 404 for a model → the model id was
retired; update `AVAILABLE_AI_MODELS` in `src/types/index.ts`.

### Known issues

- Single Image / Single Video rows accept 3 assets but publish only the first.
  Use Multi-Media for several shapes of one creative.
- Settings → Connections always shows AI as "not configured" (the status check
  is sent without the auth token); generation itself works.
- "No product" / "No persona" in the AI Co-Writer doesn't clear the selection.
- The campaign lock blocks saving, not editing.
- Drive files are renamed before Meta confirms the ad.
- No campaign-level undo.
- **Permanent delete has no undo:** anyone can permanently delete an archived
  campaign (Settings → Archived), and the app doesn't back up Firestore. Turn
  on point-in-time recovery or scheduled exports (Firestore → Disaster
  recovery).

## Will need attention eventually

- **Meta Marketing API versions** expire about a year after release (v24
  ended 6 Oct 2026). Bump `GRAPH_API_VERSION` in `src/lib/meta/constants.ts`,
  the constant in `functions/transcode-and-upload/src/index.ts` and `GRAPH` in
  `scripts/probe-multi-media.mts`; redeploy the app and the function, and test
  a publish of every ad type.
- **The Cloud Function runs Node 20** (`--runtime=nodejs20`), which is past
  end-of-life; move it to a supported runtime before Google stops deploying
  it.
- **The Flexible ad type** relies on a field Meta no longer documents
  (`creative_asset_groups_spec`); it may stop working at a version sunset.
  Multi-Media replaces it.
- **AI model ids** go stale; refresh `AVAILABLE_AI_MODELS` now and then.

## Design decisions

- **Everything publishes paused.** A person turns ads on in Ads Manager.
- **Secrets stay server-side** — Meta tokens and personal AI keys in
  `serverSecrets`, reached through Workload Identity; no key files anywhere.
- **Gates fail closed** — no allowlist means no access.
- **No roles** — everyone on the allowlist can use every feature, including
  team-wide Settings. Built for a small, trusted team.
- **"ASC" in the wizard creates a standard Sales campaign** — Meta removed API
  creation of Advantage+ Shopping campaigns.
- **Multi-Media stacks automatically** by file name and pixel size; there's no
  manual stacking yet.
- **Three ads publish at a time** (`PUBLISH_CONCURRENCY`), conservative for
  Meta's rate limits.
