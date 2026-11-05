# Campaign Orchestrator

A shared workspace for building Meta ads and publishing them in bulk. Creative
comes from Google Drive, copy from your account's past top performers and an
AI copywriter; a reviewer approves each ad; the app creates the campaign, ad
set and ads in Meta — always **paused**, so nothing spends until a person
turns it on — and renames the Drive files to match.

It replaces the spreadsheet → manual upload → copy-paste-into-Ads-Manager loop
for small teams that ship a lot of creative. **v2.0 is a simplification
release**: one AI provider, fewer settings, fewer clicks per ad — see
[CHANGELOG.md](CHANGELOG.md).

## Features

- **Build Mode** — one row per ad: pick Drive assets, drag in primary texts and
  headlines, set the URL, CTA and ad type. Each copy column shows its filled
  slots plus one empty one, so rows stay short. The ad name saves itself from
  your naming template once the row has an angle name and a type.
- **Ad types** — Multi-Media (up to 10 images and videos; shapes of one
  creative stack automatically by file name), Carousel (2–10 cards), Single
  Image and Single Video. Flexible is retired (v2.0); rows saved as Flexible
  open as Multi-Media.
- **Copy Palette** — built around one selected ad. The Copy tab switches
  between Top performers (the default: **Import** keeps the headlines and
  primary texts behind 80% of the ad account's spend in the last 90 days, up
  to 15 of each, optionally only ads whose name matches a product), the
  copywriter, and Write your own; Active lists
  everything this campaign uses, copy in an ad first and copy in no ad
  folded under Unused (with Clear unused), filtered by type, source or the
  selected ad, sorted by most used, newest or top performance, and each
  card shows which ads it's in. **Use** on any card drops it into the
  selected ad. **Split** widens the Palette to share the screen with the rows.
  Headlines are blue and primary text orange everywhere copy shows.
- **Copywriter** — in the Copy tab: pick an ad (or hit its sparkle
  button), hit **Fill this ad** and pick an angle (or Any angle) to write
  one piece per empty slot and drop them in (anything typed in the box
  steers it too), or ask in plain words and use what you like. A Fill
  mixes angles, formats and lengths. **Long-form story** writes one
  story-driven long read from the story you describe in the box.
  It writes with Gemini from the campaign's context links (each page boiled
  down once into a fact sheet) and notes, which live under **Campaign Context** next to
  Add Row on the Assembly Line, your top performers, the
  row's own copy and landing page, and the brand voice and target personas
  in Settings; a kill list keeps banned words out.
  You can also type straight into any empty copy slot. Settings → Usage
  shows your team's AI calls and estimated cost for the last 7 or 30 days.
- **Review Mode** — one ad at a time, shown roughly as it will look in the
  feed (primary text, media, then the domain, headline and CTA; **Next mix**
  steps through the copy Meta rotates), beside the ad name, every copy
  option and the comment thread between reviewer and builder. Only reviewed
  ads can be published. **Publish N reviewed** in the header sends every
  reviewed ad not yet in Meta to the wizard.
- **Publish Wizard** — new or existing campaign and ad set, objective, budget,
  pixel, Advantage+ enhancements; publishes three ads at a time, moving files
  Drive → Meta server-to-server, with plain-language results and links into Ads
  Manager.
- **Shared workspace** — campaigns are tabs everyone sees; whoever has a
  campaign open holds a lock so edits don't collide.

## How it works

```
Google Drive (creative) ──┐
                          ▼
Browser ── Firebase Auth ──▶ Next.js on Vercel ──▶ Meta Marketing API (v25)
   │                         │   API routes        campaigns, ad sets, ads — PAUSED
   └── Firestore ◀───────────┘   (Meta token read via Workload Identity, never sent to the browser)
       campaigns, settings,      ──▶ Gemini (copy, one server-side key)
       server-only secrets       ──▶ optional Cloud Function (ffmpeg, videos > 50 MB)
```

Next.js 16 · React 19 · Tailwind CSS 4 · Firebase (Auth, Firestore, Storage) ·
Google Drive API · Meta Marketing API · Vercel AI SDK · Vercel · Google Cloud.
Each user connects their own Meta account; their token is stored server-side
and reached through Workload Identity Federation, so there are no
service-account key files anywhere. The full picture is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What you need

- A **Google Cloud / Firebase** project with billing (Blaze plan); Google
  Workspace makes sign-in simplest.
- A **Meta business portfolio** with an ad account and Page, and a **Meta
  developer app**.
- **Vercel** — Pro for business use (Hobby is non-commercial).
- A **Gemini API key** (Google AI Studio) for the copywriter — one key for the
  whole team, kept on the server. Without it the rest of the app still works.

**[docs/SETUP.md](docs/SETUP.md) walks through building your own instance**,
start to finish.

## Documentation

| Doc | Read it when |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Building your own instance |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Adding users, keeping credentials alive, upgrading, fixing things |
| [CHANGELOG.md](CHANGELOG.md) | Upgrading from 1.x |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Understanding or changing how the app works |
| [docs/META_API.md](docs/META_API.md) | Changing or debugging what the app sends to Meta |
| [CLAUDE.md](CLAUDE.md) | Conventions and gotchas for AI coding agents (useful for people too) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Sending a fix or improvement |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability; the security model in brief |

## Local development

Requires Node.js 22.6 or later.

```bash
git clone https://github.com/jokicpony/campaign-orchestrator.git
cd campaign-orchestrator
npm install
cp .env.example .env.local   # fill in from your instance (docs/SETUP.md)
npm run dev                  # http://localhost:3000
```

Locally, **leave the Workload Identity variables unset** (`GCP_PROJECT_NUMBER`,
`GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_*`; with them set, the
server tries Workload Identity, which only works on Vercel), but **set
`GCP_PROJECT_ID` to your project id**: the server then reads Firestore with
your `gcloud auth application-default login`, and without the project id it
uses gcloud's default project, so every Meta call fails with a 503. Keep
`META_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback`; Meta's login
only returns there if that address is in the Meta app's Valid OAuth Redirect
URIs (otherwise Meta says "URL blocked"). The easy way round is to connect Meta
on your deployed site: tokens are stored per person in the same Firestore, so
the local server uses the same one. With no `AUTHORIZED_*` variables,
development mode admits any signed-in user.

Local development uses the same Firebase project as production, so campaigns
and settings you edit are the real ones. The copywriter needs only
`GEMINI_API_KEY` in `.env.local`, so it works locally and on previews. Meta
features need your Google account to have Firestore access on the project;
otherwise test them on your production deployment, where everything publishes
paused.

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build   # before a PR
```

## Support

Provided **as-is**, with no guaranteed support. Issues and pull requests are
welcome; it's shared in the spirit of "this was useful to us, maybe it's useful
to you."

## License

[MIT](LICENSE)
