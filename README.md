# Campaign Orchestrator

A shared workspace for building Meta ads and publishing them in bulk. Pull
creative from Google Drive, write copy with an AI co-writer or remix your
account's top performers, review every ad as a team, then publish campaigns,
ad sets and ads straight to the Meta Marketing API — always **paused**, so
nothing spends until a person turns it on.

It replaces the spreadsheet → manual upload → copy-paste-into-Ads-Manager loop
for teams that ship a lot of creative.

## Features

- **Build Mode** — one row per ad: pick Drive assets, drag in up to five
  primary texts and headlines, set the URL, CTA and ad type. Ad names come from
  your naming template.
- **Ad types** — Multi-Media (up to 10 images and videos in one ad; shapes of
  the same creative, like `Spring_1x1` and `Spring_9x16`, stack automatically
  so Meta serves the right one per placement), Carousel (2–10 cards), Flexible,
  Single Image and Single Video.
- **Copy Palette** — your ad account's highest-spending copy from the last 90
  days, ready to drag into new ads.
- **AI Co-Writer** — headlines and primary text from Gemini, Claude or GPT,
  steered by your brand voice, products, personas and modifiers. A kill list
  keeps banned words out of the output.
- **Review Mode** — one ad at a time, with comment threads between reviewer and
  builder; only reviewed ads can be published.
- **Publish Wizard** — new or existing campaign and ad set, objective, budget,
  pixel and Advantage+ enhancements. Files go Drive → Meta server-to-server,
  several ads publish at once, results come back in plain language with links
  into Ads Manager, and Drive files are renamed to match their ads.
- **Team workspace** — campaigns are shared tabs; whoever has one open holds a
  lock so edits don't collide.

## How it works

```
Google Drive (creative) ──┐
                          ▼
Browser ── Firebase Auth ──▶ Next.js on Vercel ──▶ Meta Marketing API
   │                         │   API routes        campaigns, ad sets, ads — paused
   └── Firestore ◀───────────┘   (Meta tokens read server-side, never sent to the browser)
       campaigns, settings,      ──▶ Gemini / Claude / OpenAI (copy)
       server-only secrets       ──▶ optional Cloud Function (ffmpeg, videos > 50 MB)
```

Next.js 16 · React 19 · Tailwind CSS 4 · Firebase (Auth, Firestore, Storage) ·
Google Drive API · Meta Marketing API v25 · Vercel AI SDK · Vercel. Each user
connects their own Meta account; their token is stored server-side and reached
through Workload Identity Federation, so there are no service-account key files
anywhere. The full picture is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What you need

- A **Google Cloud / Firebase** project with billing (Blaze plan); Google
  Workspace makes sign-in simplest.
- A **Meta business portfolio** with an ad account and Page, and a **Meta
  developer app**.
- **Vercel** — Pro for business use (Hobby is non-commercial).
- At least one **AI provider key** — Gemini, Anthropic or OpenAI — or have each
  user add their own.

**[docs/SETUP.md](docs/SETUP.md) walks through building your own instance**,
start to finish.

## Documentation

| Doc | Read it when |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Building your own instance |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Adding users, keeping credentials alive, upgrading, fixing things |
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

In `.env.local`, **leave the `GCP_*` variables unset** (with them set, the
server tries Workload Identity, which only works on Vercel) and keep
`META_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback`. With no
`AUTHORIZED_*` variables, development mode admits any signed-in user.

Local development uses the same Firebase project as production, so campaigns
and settings you edit are the real ones. Meta features and AI generation read
`serverSecrets` through your Application Default Credentials
(`gcloud auth application-default login`) — they work only if your Google
account has Firestore access on the project; otherwise test them on your
production deployment, where everything publishes paused.

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build   # before a PR
```

## Support

Provided **as-is**, with no guaranteed support. Issues and pull requests are
welcome; it's shared in the spirit of "this was useful to us, maybe it's useful
to you."

## License

[MIT](LICENSE)
