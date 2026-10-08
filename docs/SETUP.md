# Setup — building your own instance

A start-to-finish guide to running Campaign Orchestrator for your own team:
your own repository, Firebase project, Meta app and Vercel deployment. Expect
an afternoon, much of it in Meta's developer console. Day-to-day running is in
[OPERATIONS.md](OPERATIONS.md); how the pieces connect is in
[ARCHITECTURE.md](ARCHITECTURE.md).

Do the steps in order; later ones need values from earlier ones. Keep a
scratch list of what you collect — most of it ends up in Vercel's environment
variables (step 6), each described in `.env.example`.

## What you need

- A **Google Cloud** account with **billing enabled** — the Firebase project
  must be on the Blaze (pay-as-you-go) plan for Storage and the optional Cloud
  Function. A **Google Workspace** makes sign-in simplest (see 3.2).
- A **Meta business portfolio** with the ad account, Facebook Page (and
  Instagram account) you'll publish to, and a **Meta developer account**.
- A **Vercel** account. Use **Pro** for a business — Hobby is for
  non-commercial use. Publishing routes run for up to 300 seconds. As written,
  the app runs on Vercel only (see "Hosting somewhere other than Vercel").
- A **GitHub** account for your copy of the code.
- At least one AI key — [Gemini](https://aistudio.google.com/apikey),
  [Anthropic](https://console.anthropic.com/) or
  [OpenAI](https://platform.openai.com/api-keys) — or let each user add their
  own in Settings.
- Locally: Node.js 22.6+, the [`gcloud` CLI](https://cloud.google.com/sdk/docs/install)
  (`gcloud auth login`) and the Firebase CLI (via `npx firebase-tools`,
  `npx firebase-tools login`).

## 1. Make your own private copy of the repository

You'll commit your team's email allowlist into `firestore.rules`, so use a
**private** repository — a GitHub fork of a public repo is always public.

1. On GitHub, create an empty **private** repository.
2. Push this code to it, keeping this repo as `upstream` for upgrades:

```bash
git clone https://github.com/jokicpony/campaign-orchestrator.git
cd campaign-orchestrator
git remote rename origin upstream
git remote add origin git@github.com:<you>/<your-repo>.git
git push -u origin main
npm install
```

Per-deployment values in code — change them now if they don't fit:

- `src/lib/config/deployment.ts` — `DEFAULT_TARGET_COUNTRIES` (`['US']`) and
  the fallback minimum age `DEFAULT_AGE_MIN` (18; the real value is a
  setting).
- `firestore.rules` and `storage.rules` — your team (step 3).

## 2. Create the Vercel project (no configuration yet)

Later steps need its domain, team slug and project name.

1. Vercel → Add New → Project → import your repository (Next.js is detected;
   no build settings to change). The first deployment may fail for lack of
   environment variables — that's fine.
2. Note the **production domain** (Project → Settings → Domains, e.g.
   `your-project.vercel.app`, or add your own), the **team slug**
   (`vercel.com/<slug>`) and the **project name**.
3. **Settings → Security → OIDC Federation:** enable, **Team** mode.

## 3. Firebase

One Google Cloud project serves as the Firebase project.

1. [console.firebase.google.com](https://console.firebase.google.com) → Add
   project; upgrade it to **Blaze**. Note the **project ID**.
2. **Who can sign in.** The app signs people in with Google and asks for the
   full Google Drive scope, which Google treats as restricted. In the Google
   Cloud console → **Google Auth Platform → Audience**:
   - **Internal** (Workspace only): everyone in your Workspace can sign in,
     no review needed. Simplest.
   - **External, Testing mode**: only listed test users (up to 100).
   - External in production with the Drive scope needs Google's verification.
3. **Authentication → Sign-in method → Google:** enable. **Settings →
   Authorized domains:** add your production domain from step 2.
4. **Firestore Database → Create database:** keep the database ID
   `(default)`, Standard edition, Native mode, a region near you.
5. **Your team, in the rules.** Edit `isTeamMember()` in **both**
   `firestore.rules` and `storage.rules` to your domain and/or individual
   emails (a domain like `gmail.com` would admit everyone on it). Commit, then:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage --project <project-id>
   ```
   (`firebase.json` points the CLI at both files.) Firestore rules let team
   members share campaigns and settings, keep each user's data private, and
   deny every client access to `serverSecrets`.
6. **Storage → Get started** (default bucket) **before** that deploy. It caches
   thumbnails at `thumbnails/{driveFileId}.jpg`; if Storage isn't set up the
   app still works, just slower.
7. **Project settings → General → Your apps → Add app → Web:** copy the
   config — the six `NEXT_PUBLIC_FIREBASE_*` values (public by design; the
   rules protect the data).

## 4. Google Cloud — Drive and keyless server access

API routes read and write `serverSecrets` (each user's Meta token and personal
AI keys) as a service account **without a key file**: Vercel's per-deployment
OIDC token is exchanged for short-lived Google credentials (Workload Identity
Federation; Vercel's guide: [Connect to GCP](https://vercel.com/docs/oidc/gcp)).
Run as a project Owner:

```bash
PROJECT=<project-id>
PNUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
TEAM=<vercel-team-slug>
VPROJECT=<vercel-project-name>
SA="mco-admin-sdk@${PROJECT}.iam.gserviceaccount.com"

# 4.1 APIs — Drive for the app itself; the rest for Workload Identity
gcloud services enable drive.googleapis.com iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com --project="$PROJECT"

# 4.2 Service account with Firestore access only
gcloud iam service-accounts create mco-admin-sdk --project="$PROJECT" \
  --display-name="Server-side Firestore"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${SA}" --role="roles/datastore.user" --condition=None

# 4.3 Pool + provider trusting only your Vercel team's OIDC tokens
gcloud iam workload-identity-pools create vercel-pool --project="$PROJECT" --location=global --display-name="Vercel OIDC"
gcloud iam workload-identity-pools providers create-oidc vercel-provider --project="$PROJECT" --location=global \
  --workload-identity-pool=vercel-pool \
  --issuer-uri="https://oidc.vercel.com/${TEAM}" \
  --allowed-audiences="https://vercel.com/${TEAM}" \
  --attribute-mapping="google.subject=assertion.sub" \
  --attribute-condition="assertion.owner=='${TEAM}'"

# 4.4 Only your PRODUCTION deployment may act as the service account
gcloud iam service-accounts add-iam-policy-binding "$SA" --project="$PROJECT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principal://iam.googleapis.com/projects/${PNUM}/locations/global/workloadIdentityPools/vercel-pool/subject/owner:${TEAM}:project:${VPROJECT}:environment:production"

echo "GCP_PROJECT_NUMBER=$PNUM  GCP_SERVICE_ACCOUNT_EMAIL=$SA"
```

Because the binding names the production environment, preview deployments
can't reach `serverSecrets`: Meta features return 503 and AI generation fails
there. (To allow previews you'd add a second binding with
`environment:preview`, preview environment variables, and the preview domain
in Firebase's authorized domains and Meta's redirect URIs.)

**Keep the project's IAM list as small as your team allowlist:** anyone with
Owner, Editor or Firestore access on the project can read every user's stored
Meta token.

## 5. Meta app

Meta's developer console changes often; the essentials:

1. [developers.facebook.com](https://developers.facebook.com) → My Apps →
   Create app, connected to your business portfolio, with the **Marketing
   API** and **Facebook Login**.
2. The app requests these permissions with a classic `scope` parameter
   (`src/app/api/auth/meta/route.ts`): `ads_read`, `ads_management`,
   `business_management`, `pages_read_engagement`, `pages_show_list`. If your
   app only offers *Facebook Login for Business* (which expects a
   `config_id`), adjust that route.
3. Facebook Login → Settings → **Valid OAuth Redirect URIs**:
   `https://<your domain>/api/auth/meta/callback` and, for local development,
   `http://localhost:3000/api/auth/meta/callback`.
4. While the app is in **Development** mode only people with a role on it
   (App roles → Developers/Testers) can connect — enough for a small team.
   For anyone else, request **Advanced Access** to those permissions (App
   Review, which needs Business Verification).
5. Settings → Basic: copy the **App ID** and **App Secret**.

Each user's Facebook account also needs access to the ad account, Page and
pixel in your business portfolio — the app publishes with each user's own
token.

## 6. Vercel configuration

**Settings → Environment Variables** (Production):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_APP_ID` | the six values from step 3.7 |
| `NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET` | step 5.5 |
| `META_REDIRECT_URI` | `https://<your domain>/api/auth/meta/callback` |
| `AUTHORIZED_EMAIL_DOMAINS` and/or `AUTHORIZED_EMAILS` | the same people as the rules — **without these every API call is denied** |
| `GCP_PROJECT_ID` | the project ID |
| `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL` | printed at the end of step 4 |
| `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | `vercel-pool`, `vercel-provider` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | at least one, unless every user brings their own |

Then **Deployments → ⋯ → Redeploy**. `NEXT_PUBLIC_*` values are baked in at
build time, so redeploy whenever they change. If the Workload Identity
variables are only partly set, the server refuses to start a Firestore client
rather than falling back.

## 7. Optional: the large-video transcode function

Videos over 50 MB can be routed through a Cloud Function that re-encodes them
with ffmpeg and uploads them to Meta. Without it everything works, but very
large videos may be rejected by Meta.

```bash
PROJECT=<project-id>
gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com secretmanager.googleapis.com --project=$PROJECT

# A runtime identity with no project roles — the function needs none
gcloud iam service-accounts create transcode-fn --project=$PROJECT --display-name="Transcode function"
FN_SA="transcode-fn@${PROJECT}.iam.gserviceaccount.com"

# The shared key, readable only by that identity
gcloud secrets create transcode-api-key --replication-policy=automatic --project=$PROJECT
openssl rand -hex 32 | tr -d '\n' | gcloud secrets versions add transcode-api-key --data-file=- --project=$PROJECT
gcloud secrets add-iam-policy-binding transcode-api-key --project=$PROJECT \
  --member="serviceAccount:$FN_SA" --role=roles/secretmanager.secretAccessor

# First deploy (deploy.sh handles later updates)
(cd functions/transcode-and-upload && npm ci && npm run build)
gcloud functions deploy transcode-and-upload --gen2 --region=us-central1 --project=$PROJECT \
  --runtime=nodejs20 --source=functions/transcode-and-upload --entry-point=transcodeAndUpload \
  --trigger-http --memory=2Gi --timeout=540s --set-build-env-vars=GOOGLE_NODE_RUN_SCRIPTS="" \
  --service-account=$FN_SA --allow-unauthenticated \
  --set-secrets=TRANSCODE_API_KEY=transcode-api-key:latest
```

The function must be publicly invocable — it checks its own `x-api-key`, and
it's given no Google or Meta credentials (each request carries the user's
tokens). An organisation policy restricting sharing to your domain rejects
`--allow-unauthenticated` and needs an exception.

In Vercel, set `VIDEO_TRANSCODE_FUNCTION_URL` to the URL the deploy prints and
`TRANSCODE_API_KEY` to the key
(`gcloud secrets versions access latest --secret=transcode-api-key --project=$PROJECT`),
then redeploy. Later updates: `PROJECT_ID=<project-id> bash functions/transcode-and-upload/deploy.sh`.

## 8. First run

1. Open your production domain and sign in with a team account.
2. **Settings** (avatar menu) **→ Connections:** Connect Meta, then choose the
   ad account and Page. The star makes an ad account the team default.
3. **Settings → Ad Setup:** ad naming and campaign naming templates, URL
   parameters (UTMs), Audience Defaults (minimum age).
4. **Settings → Brand Voice, Products, Personas, Modifiers:** context for the
   AI co-writer.
5. Create a campaign tab, open **Assets** and paste a Google Drive folder URL,
   build a row, switch to **Review** and mark it reviewed, then **Publish
   Selected** to a new test campaign. Everything is created **paused** — check
   it in Ads Manager, then delete it.

If something fails, see [OPERATIONS.md → When something breaks](OPERATIONS.md#when-something-breaks).

## Hosting somewhere other than Vercel

The UI and most routes are plain Next.js, but in production the server
reaches Firestore only through Vercel's OIDC token
(`src/lib/server/gcpFirestore.ts`). On Google Cloud (e.g. Cloud Run with an
attached service account) you'd change `getServerFirestore` to use Application
Default Credentials in production. Long-running routes need a platform that
allows 300-second requests.

## Upgrading

```bash
git fetch upstream && git merge upstream/main && git push
```

Then see [OPERATIONS.md → Upgrading](OPERATIONS.md#upgrading) for what to
redeploy.
