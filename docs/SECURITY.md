# Security & Authentication Architecture

How identity, authorization, and third-party credentials work in this app. Read
this before touching auth, the Meta connect flow, or the token stores.

## Principles

- **No third-party access token ever reaches the browser.** The Meta long-lived
  token lives server-side only; the client holds non-secret connection metadata.
- **No downloadable service-account keys.** Server-to-Google auth uses Workload
  Identity Federation (short-lived, federated credentials), never a JSON key.
- **Every gate fails closed.** An unset allowlist, a missing shared secret, or a
  partial cloud config denies the request rather than allowing it.

---

## 1. Request authentication

Every sensitive `/api` route calls `requireAuth` (`src/lib/server/verifyAuth.ts`),
which verifies the caller's Firebase **ID token** (`Authorization: Bearer <token>`)
against Google's public JWKS using `jose` — no Admin SDK required. Clients attach
the token via `authedFetch` (`src/lib/api/authedFetch.ts`).

**Authorization (allowlist).** After verifying identity, `isAllowed` checks the
email against `AUTHORIZED_EMAILS` / `AUTHORIZED_EMAIL_DOMAINS`. Firebase auth alone
admits *any* Google account in the project, so:

- If **no** allowlist is set, the request is **denied in production** (allowed in
  dev). Override with `ALLOW_ALL_AUTHENTICATED=true` for a public self-host.
- Keep the allowlist in sync with the team check in `firestore.rules`.

Unverified emails are never matched against the allowlist.

---

## 2. The Meta access token — server-side only

The Meta long-lived token (~60 days) is **never** sent to the browser, written to
a client-readable document, or accepted in a request body. It lives in Firestore
at `serverSecrets/{uid}`, denied to all clients by rules and reachable only by the
backend (§3).

### Connect flow

1. **Start** — the client calls `POST /api/auth/meta` via `authedFetch`. The route
   verifies the user and stashes the uid in an **httpOnly** cookie (`meta_oauth_uid`)
   alongside a random CSRF `state` cookie, then returns the Facebook dialog URL.
   The client navigates the top window to it. (`startMetaOAuth` is the one client
   entry point — never navigate straight to `/api/auth/meta`; it is POST-only.)
2. **Callback** — `GET /api/auth/meta/callback` validates `state` against the
   cookie, reads the uid cookie, exchanges the code for the long-lived token,
   **stores it with `setMetaToken(uid, …)`**, and redirects to
   `/?meta_connected=true#meta_data=<metadata>`. The fragment carries only
   non-secret metadata (ad-account and Page ids/names, expiry) — **no token** — and
   the client scrubs it from the URL via `history.replaceState` on load.
3. **Use** — each route resolves the token with `requireMetaToken(authed.uid)`
   (`src/lib/server/metaAuth.ts`), which returns:
   - the token, or
   - **401 `TOKEN_EXPIRED`** — not connected / expired → the client prompts reconnect, or
   - **503 `TOKEN_STORE_UNAVAILABLE`** — Firestore/WIF outage → retry, *not* reconnect.
4. **Disconnect** — `DELETE /api/auth/meta` calls `deleteMetaToken(uid)` so
   disconnecting actually revokes the stored credential.

> **Note on Page tokens:** the app publishes *ads* through the ad account using
> the user token; Pages are referenced by `page_id` only. Page access tokens are
> never fetched or stored (they would otherwise leak into the connection metadata).

### After a deploy of this model

Existing users must **reconnect Meta once** — their token previously lived only in
the old client doc, which the new code no longer reads. Reconnecting replaces that
doc (metadata only) and populates `serverSecrets`. A one-off cleanup for dormant
accounts lives at `scripts/purge-legacy-meta-tokens.mjs`.

---

## 3. Keyless server → Google (Workload Identity Federation)

The backend reads/writes Firestore as a dedicated service account **without a
downloadable key** (org policy `iam.disableServiceAccountKeyCreation` forbids keys,
and keys are a liability regardless). On Vercel, the deployment's short-lived OIDC
token is exchanged at Google STS for credentials that impersonate the service
account (`src/lib/server/gcpFirestore.ts`, via `ExternalAccountClient` +
`@vercel/oidc`). Locally, it falls back to Application Default Credentials
(`gcloud auth application-default login`). In production, a partial WIF config
throws rather than silently falling back.

### One-time setup (reproducible runbook)

Replace `<PLACEHOLDERS>`. Requires an owner/IAM-admin on the GCP project.

```bash
PROJECT=<gcp-project-id>
PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
TEAM=<vercel-team-slug>          # from your Vercel team URL: vercel.com/<slug>
VPROJECT=<vercel-project-name>   # the project's slug in Vercel
SA="mco-admin-sdk@${PROJECT}.iam.gserviceaccount.com"

# APIs
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com --project="$PROJECT"

# Least-privilege service account (Firestore only)
gcloud iam service-accounts create mco-admin-sdk --project="$PROJECT" \
  --display-name="Server-side (Admin SDK → Firestore)"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA}" --role="roles/datastore.user" --condition=None

# Workload Identity pool + provider trusting Vercel's OIDC issuer
gcloud iam workload-identity-pools create vercel-pool --project="$PROJECT" --location=global --display-name="Vercel OIDC"
gcloud iam workload-identity-pools providers create-oidc vercel-provider --project="$PROJECT" --location=global \
  --workload-identity-pool=vercel-pool \
  --issuer-uri="https://oidc.vercel.com/${TEAM}" \
  --allowed-audiences="https://vercel.com/${TEAM}" \
  --attribute-mapping="google.subject=assertion.sub"

# Let ONLY the production deployment impersonate the SA (scope tighter/looser as needed)
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/projects/${PNUM}/locations/global/workloadIdentityPools/vercel-pool/subject/owner:${TEAM}:project:${VPROJECT}:environment:production"
```

Then in **Vercel** → Settings → enable **OIDC Federation (Team mode)** and set:

| Env var | Value |
|---|---|
| `GCP_PROJECT_ID` | your GCP project id |
| `GCP_PROJECT_NUMBER` | its project number |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `mco-admin-sdk@<project>.iam.gserviceaccount.com` |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel-pool` |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel-provider` |

The WIF path can only be exercised where the binding applies (production, above) —
preview/other environments fall back to ADC or fail closed. See
[Vercel → GCP OIDC](https://vercel.com/docs/oidc/gcp).

---

## 4. Google Drive token

Drive uses a client-side OAuth access token (~1h). It is persisted to
`localStorage` and mirrored into a **`SameSite=Strict`, path-scoped** cookie
(`mco_drive_token`, path `/api/video-proxy`) so `<video>` streaming can carry it
without putting it in a URL. `video-proxy` rejects cross-site requests; the Strict
cookie is the actual credential. (A durable server-side Drive OAuth refresh flow
is a known future improvement.)

---

## 5. Firestore data model & rules

`firestore.rules` (deploy via `firebase deploy --only firestore:rules` or the
console Rules editor):

| Path | Access |
|---|---|
| `users/{uid}/**` | owner-only (profile, personal settings, connection **metadata**) |
| `campaigns/{id}` | any team member |
| `settings/global` | any team member |
| `serverSecrets/{uid}` | Meta token + per-user AI provider keys. **Denied to all clients** — backend-only via IAM (WIF bypasses rules) |
| everything else | denied |

Team membership = verified email matching the allowlist in `isTeamMember()`. Keep
it in sync with the API allowlist env vars.

---

## 6. Other safeguards

- **Fail-closed transcode function** — the Cloud Function refuses all requests if
  `TRANSCODE_API_KEY` is unset, and compares the key in constant time.
- **SSRF/DoS guards** — the thumbnail proxy validates the host allowlist on every
  redirect hop and caps response size; image resizing bounds input pixels.
- **OAuth CSRF** — random `state` in an httpOnly `SameSite=Lax` cookie, validated
  before the uid is trusted.
- **PAUSED by default** — every published ad starts paused; no accidental delivery.
- **Graph API version** pinned in one place: `src/lib/meta/constants.ts`.
- **AI provider keys** — resolved from the user's OWN key first (stored server-side
  in `serverSecrets/{uid}`, owner-only), then a server env var (`GEMINI_API_KEY` /
  `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`). Keys are set/cleared via the
  authenticated `/api/ai/keys` route, are never returned to the client, and never
  live in a client-readable doc. `GET /api/ai/generate` is authenticated. Model
  selection carries a `supportsTemperature` flag so the route omits `temperature`
  for models that reject it (e.g. Claude Sonnet 5 / Opus 4.8, GPT-5 reasoning).

---

## 7. Runbook

- **"Reconnect Meta" loop after deploy** — expected once (see §2). If it persists,
  check that the WIF env vars are set for the environment and the SA binding covers
  it; a `503 TOKEN_STORE_UNAVAILABLE` points at WIF/Firestore, not the token.
- **Rotate the transcode key** — update it on both the Cloud Function and the
  Vercel `TRANSCODE_API_KEY` in lockstep, or transfers 401 until they match.
- **Revoke a user's Meta access** — they click Disconnect (`DELETE /api/auth/meta`),
  or delete their `serverSecrets/{uid}` document.
