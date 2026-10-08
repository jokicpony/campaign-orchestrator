# Security Policy

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report them
privately through GitHub: this repository's **Security** tab → **Report a
vulnerability**. Include a description, steps to reproduce, and any relevant
logs (with tokens, account IDs and emails removed).

This is a volunteer-maintained project with no guaranteed response time, but
reports are taken seriously and fixed before public disclosure.

## Scope

This policy covers the Campaign Orchestrator code. Problems in the services it
uses (Firebase, Google Cloud, Vercel, Meta, the AI providers) go to those
vendors. Your own instance's configuration — allowlists, rules, keys — is your
responsibility; [docs/SETUP.md](docs/SETUP.md) and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#who-is-allowed-to-do-what) describe
the intended setup.

## Security model in brief

- **Sign-in and API access:** Firebase Google sign-in. Every sensitive API
  route verifies the Firebase ID token and checks the email against
  `AUTHORIZED_EMAILS` / `AUTHORIZED_EMAIL_DOMAINS`. In production an empty
  allowlist **denies everyone**. `ALLOW_ALL_AUTHENTICATED=true` admits any
  Google account to the API (and your server AI keys); it isn't a supported
  public mode.
- **Firestore:** `firestore.rules` lets team members (the same allowlist,
  repeated in the rules) share campaigns and settings, keeps per-user data
  owner-only, and denies all clients access to `serverSecrets`.
- **Meta tokens and personal AI keys** are stored in `serverSecrets/{uid}` and
  never sent to the browser, accepted in request bodies, or put in URLs. Meta
  OAuth is CSRF-protected with a `state` cookie; Page access tokens are never
  fetched.
- **No key files:** the server reaches Firestore through Workload Identity
  Federation (Vercel OIDC → short-lived Google credentials), bound to the
  production deployment only. Google Cloud IAM is part of the trust boundary:
  anyone with Owner, Editor or Firestore access on the project can read the
  stored tokens, so keep that list as small as the team allowlist.
- **Drive:** each user's own short-lived Google token, held in the browser; video
  streaming carries it in a `SameSite=Strict` cookie scoped to the proxy route,
  not in URLs.
- **Outbound fetches:** the thumbnail proxy allows only Google hosts, re-checks
  every redirect and caps response size.
- **Transcode function (optional):** publicly invocable but refuses requests
  without the shared `TRANSCODE_API_KEY` (constant-time compare, fails closed
  when unset). It is given no Google or Meta credentials of its own; deploy it
  with a dedicated service account that has no project roles
  ([docs/SETUP.md](docs/SETUP.md) step 7).
- **Thumbnail cache:** Firebase Storage, limited to the team by
  `storage.rules` — but download URLs carry a token that bypasses the rules,
  so anyone holding a thumbnail URL can load it.
- **Nothing goes live by accident:** campaigns, ad sets and ads are always
  created paused.
- **No roles:** everyone on the allowlist can use every feature, including
  team-wide Settings. The app assumes a trusted team.

## Supported versions

Only the latest commit on `main` is maintained.
