# Contributing to Campaign Orchestrator

Thanks for your interest. Bug reports, fixes and focused improvements are all
welcome. The project is maintained as-is in spare time, so reviews may take a
while.

## Getting set up

You'll need your own instance to test against: for UI work, at least a
Firebase project with the rules deployed and Google sign-in on
([docs/SETUP.md](docs/SETUP.md) steps 1–3); for anything touching Meta or AI
generation, the whole setup — those need the server's secret store, which works
on your production deployment or locally with ADC that can read Firestore
(everything publishes paused). Then follow "Local development" in the
[README](README.md).

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces connect,
[docs/META_API.md](docs/META_API.md) what is sent to Meta, and
[CLAUDE.md](CLAUDE.md) lists the conventions and the gotchas that have cost
time before — worth a skim whoever (or whatever) is writing the code.

## Before you open a PR

There's no CI; please run these locally:

```bash
npm run lint
npx tsc --noEmit
npm test          # offline checks for multi-media stacking and payloads
npm run build
```

Depending on what you touched:

- **The publish path** (`src/app/api/meta/`, `src/lib/meta/`,
  `src/components/PublishWizard/`): say which ad types you published with it
  and what you checked in Ads Manager. For payload changes, a
  `scripts/probe-multi-media.mts validate` run (Meta checks the payload,
  creates nothing) is a good first step.
- **Multi-media stacking or naming:** add cases to `scripts/test-multi-media.mts`.
- **Auth, tokens or `firestore.rules`:** keep the model in
  [SECURITY.md](SECURITY.md) intact — no tokens or keys in the browser or in
  request bodies, no service-account key files, gates fail closed.
- **OAuth scopes:** note in the PR that every user must reconnect Meta.
- **Behaviour described in the docs:** update the README, `docs/` or
  `CLAUDE.md` in the same PR.
- **No deployment-specific values** (company names, account IDs, emails) in
  code; configurable defaults belong in `src/lib/config/deployment.ts`.

## Pull requests

- Branch from `main`; keep each PR to one concern.
- Describe what changed and why, how you tested it, and include screenshots for
  UI changes.
- Commit subjects start with `feat:`, `fix:`, `ui:`, `refactor:`, `docs:` or
  `chore:`, under 72 characters.

## Reporting issues

Open an issue with what you expected, what happened, and steps to reproduce.
For publish failures, the error on the results screen and the matching log line
(with its `fbtrace_id`) usually say what went wrong — include them, with
account IDs, tokens and emails removed. Security problems go to
[SECURITY.md](SECURITY.md), not an issue.
