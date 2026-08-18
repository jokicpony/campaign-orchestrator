# Campaign Orchestrator

A purpose-built creative management platform for **Meta advertisers** — creative strategists, media buyers, and production teams who need a faster, smarter way to build, review, and publish ad campaigns at scale.

Campaign Orchestrator replaces the fragmented workflow of spreadsheets, manual uploads, and copy-pasting into Ads Manager with an integrated workstation powered by **drag-and-drop assembly**, **AI-assisted copywriting**, and **one-click bulk publishing** directly to the Meta Marketing API.

---

## ✨ Key Features

### 🏗️ Build Mode — The Assembly Line

A three-column creative workstation designed for rapid ad production:

- **Assembly Line** — Drag-and-drop ad rows where you pair visual assets with copy variations. Each row represents a single ad unit with its own headline, primary text, destination URL, and call-to-action.
- **Copy Palette** — A curated ingredient library pulled from your **Top Performers** on Meta. Historical copy is aggregated by spend and CTR, so you can see what's actually working and remix it into new campaigns.
- **AI Co-Writer (Brain)** — Generate headlines and primary text with your choice of Gemini, Claude, or GPT models, guided by your brand voice, product USPs, target personas, and creative modifiers. Review generated options, iterate, and drag approved copy directly into your ad rows.

**Ad Types & Asset Management:**
| Type | Assets | Use Case |
|------|--------|----------|
| **Flexible** | Up to 10 mixed images/videos | Multi-asset A/B testing via Meta's AI |
| **Single Image** | Up to 3 images | Size variations (9:16, 1:1, 1.9:1) |
| **Single Video** | Up to 3 videos | Size variations (Vertical, Square, Horizontal) |

Assets are sourced directly from **Google Drive**, with full-resolution previews, usage tracking across campaigns, and automatic file renaming for audit trails.

---

### 🔍 Review Mode — Quality Control

A focused horizontal carousel for ad-by-ad inspection and team collaboration:

- **Full-Screen Cards** — Large creative previews with "peek" context for adjacent ads
- **Bidirectional Feedback** — Inline threaded conversations between reviewers and builders
- **Priority Queue** — Ads needing attention automatically surface first
- **Status Tracking** — Visual pill badges (Approved, Needs Changes, Response) with instant tooltips
- **Keyboard Navigation** — Arrow keys to move through the queue, auto-advance after approval

---

### 🚀 Publish Wizard — Bulk Publishing to Meta

A guided 4-step wizard that migrates finished ads directly to Meta Ads Manager:

1. **Campaign Target** — Create a new campaign or add to an existing one
2. **Configuration** — Set objective, budget, optimization goal, and conversion pixel
3. **Creative Confirmation** — Verify URLs, CTAs, and asset-to-ad mappings
4. **Review & Publish** — Final audit with real-time progress tracking

**Supports:**
- **Standard objectives** — Sales, Awareness, Traffic, Engagement, and Leads (the Advantage+ toggle maps to a standard Sales campaign; Meta's API no longer creates legacy ASC)
- **Mixed-format batches** — Flexible, single, and carousel ads in the same publish run
- **Concurrent publishing** — ads publish in parallel via a bounded pool, so large and video-heavy batches finish far faster than one-at-a-time
- **Server-to-server asset migration** — Assets transfer from Google Drive → Meta without touching the browser
- **Pre-publish validation** — Real-time connection health checks with inline reconnection
- **Paused-by-default safety** — All ads publish as PAUSED for human-in-the-loop review
- **Deep links** — Direct links to your new campaign in Ads Manager and source assets in Drive

---

### 🧠 AI Co-Writer

Generate production-ready ad copy with **your choice of provider** — Google Gemini, Anthropic Claude, or OpenAI GPT:

- **Bring your own key** — Pick a provider and model in Settings; teammates can add their own API keys (stored server-side), falling back to shared env keys
- **Brand Voice** — Configure a persistent system prompt that captures your brand's tone, guidelines, and a "kill list" of words to avoid — enforced on the output, not just the prompt
- **Products** — Define products with names, emojis, and unique selling points that inject directly into the AI prompt
- **Customer Personas** — Target audience profiles with demographics, pain points, and motivations
- **Creative Modifiers** — Stackable prompt adjustments (e.g., "Punchy", "Benefit-Led", "Urgency") to steer creative direction
- **Streaming Output** — Results render chunk-by-chunk for instant feedback
- **Review & Iterate** — Accept, reject, or remix generated options before adding to the palette

---

### ⚙️ Settings & Configuration

A persistent settings modal for managing your creative toolkit:

| Tab | Purpose |
|-----|---------|
| **Connections** | Meta OAuth, Google Drive, ad account & page selection |
| **Products** | Product catalog with USPs and emoji identifiers |
| **Personas** | Target audience profiles for AI-driven copy generation |
| **Brand Voice** | AI provider & model choice, per-user API keys, system prompt, and brand knowledge |
| **Modifiers** | Stackable prompt adjustments for creative direction |
| **Ad Types** | Naming aliases and descriptions for Flexible/Single formats |
| **Ad Setup** | Ad-type config, naming templates, and audience defaults (e.g. minimum age) |
| **Archived** | Campaign vault with restore and permanent delete |

---

### 🤝 Collaboration

Built for teams working across time zones:

- **Automatic Locking** — One editor per campaign at a time, with friendly name display
- **View-Only Mode** — Browse and review while someone else is editing
- **Automatic Release** — Locks clear when the editor closes the tab or switches campaigns
- **Campaign-Scoped Palettes** — All team members see the same copy library for a given campaign

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Next.js](https://nextjs.org) 16 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19, Tailwind CSS 4, Framer Motion |
| **AI** | Gemini, Claude & GPT via the Vercel AI SDK |
| **Auth & Database** | Firebase (Authentication + Firestore) |
| **Asset Storage** | Google Drive API |
| **Ad Platform** | Meta Marketing API (Graph API) |
| **Icons** | Lucide React |
| **Deployment** | Vercel |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- A **Firebase** project (Authentication + Firestore)
- A **Meta Developer App** with `ads_management` and `ads_read` permissions
- A **Google Cloud** project with Drive API enabled
- At least one **AI provider key** — [Gemini](https://aistudio.google.com/apikey), [Anthropic](https://console.anthropic.com/), or [OpenAI](https://platform.openai.com/api-keys) (users can also add their own in Settings)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jokicpony/campaign-orchestrator.git
   cd campaign-orchestrator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```

   Fill in your credentials:
   ```env
   # AI — at least one provider (users can also add their own keys in Settings)
   GEMINI_API_KEY=your_gemini_api_key
   # ANTHROPIC_API_KEY=your_anthropic_api_key
   # OPENAI_API_KEY=your_openai_api_key

   # Firebase
   NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Meta Marketing API
   NEXT_PUBLIC_META_APP_ID=your_meta_app_id
   META_APP_SECRET=your_meta_app_secret
   META_REDIRECT_URI=http://localhost:3000/api/auth/meta/callback
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000) and connect your Meta and Google accounts via **Settings → Connections**.

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   └── api/                # Server-side API routes
│       ├── ai/             # Gemini AI proxy
│       ├── auth/           # OAuth callbacks (Meta, Google)
│       ├── drive/          # Google Drive operations
│       ├── meta/           # Meta Marketing API bridge
│       └── thumbnail/      # Asset thumbnail processing
├── components/
│   ├── BuildMode/          # Assembly workstation
│   │   ├── AssemblyLine/   # Ad row management
│   │   ├── AssetLibrary/   # Google Drive asset browser
│   │   ├── Brain/          # AI Co-Writer interface
│   │   └── Palette/        # Copy ingredient library
│   ├── PublishWizard/      # 4-step bulk publishing flow
│   ├── ReviewMode/         # QA carousel & feedback
│   └── Settings/           # Global configuration panels
├── hooks/                  # Shared React hooks
├── lib/                    # Core business logic
│   ├── ai/                 # Gemini prompt construction
│   ├── dnd/                # Drag-and-drop primitives
│   ├── firebase/           # Firestore client
│   ├── google/             # Drive API helpers
│   ├── meta/               # Meta Marketing API client
│   └── undo/               # Undo/redo state management
└── types/                  # Shared TypeScript definitions

functions/
└── transcode-and-upload/   # Optional GCP Cloud Function for >50MB video (see below)
```

---

## 🔒 Security Notes

Full detail — including the keyless cloud-credential setup — is in
[`docs/SECURITY.md`](docs/SECURITY.md). In short:

- **API routes require authentication** — every sensitive `/api` route verifies a
  Firebase ID token server-side (`src/lib/server/verifyAuth.ts`); clients attach it
  via `authedFetch`. Set `AUTHORIZED_EMAILS` / `AUTHORIZED_EMAIL_DOMAINS` to restrict
  the workspace to your team. An unset allowlist **denies** in production.
- **The Meta token never touches the browser** — OAuth (CSRF-`state` protected)
  stores the long-lived token **server-side** in Firestore `serverSecrets/{uid}`;
  routes look it up by the verified uid. The client only ever holds non-secret
  connection metadata.
- **No downloadable service-account keys** — the backend reaches Firestore via
  Workload Identity Federation (Vercel OIDC → short-lived Google credentials).
- **Tokens stay out of URLs** — the Drive token for video streaming travels in a
  `SameSite=Strict`, path-scoped cookie, not query strings.
- **SSRF guarded** — the thumbnail proxy validates the host allowlist on every
  redirect and caps response size.
- **Firestore rules** (`firestore.rules`) — `serverSecrets` is denied to all
  clients (backend-only); per-user data is owner-only; campaigns and org settings
  are team-shared. Deploy via `firebase deploy --only firestore:rules`.
- All published campaigns default to **PAUSED** — no accidental live delivery.
- Graph API version is pinned in one place: `src/lib/meta/constants.ts`.

---

## 🎬 Optional: Large-Video Transcode Function

Meta's API rejects very large video uploads. For files **over 50MB**, the app can
hand off to an optional GCP Cloud Function (`functions/transcode-and-upload/`)
that transcodes with FFmpeg and uploads Drive → Meta server-to-server.

This is entirely optional — without it, everything works except >50MB video
transfers. To enable it, deploy the function
(`bash functions/transcode-and-upload/deploy.sh`, see the notes inside), then set
`VIDEO_TRANSCODE_FUNCTION_URL` and a shared secret `TRANSCODE_API_KEY` in both
the function's environment and your app deployment.

---

## 🤝 Support

This project is provided **as-is**, with no guaranteed support or response
times. Issues and pull requests are welcome, but please don't expect an SLA —
it's shared in the spirit of "this was useful to us; maybe it's useful to you."

---

## 📄 License

[MIT](LICENSE)
