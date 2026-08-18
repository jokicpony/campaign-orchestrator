#!/bin/bash
# Deploy the transcode-and-upload Cloud Function to GCP
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. Cloud Functions API enabled in GCP Console
#   3. Cloud Build API enabled in GCP Console
#   4. Artifact Registry API enabled in GCP Console
#
# Usage: bash functions/transcode-and-upload/deploy.sh
#   Override the target per deployment via env, e.g.
#     PROJECT_ID=my-gcp-project REGION=europe-west1 bash .../deploy.sh

set -euo pipefail

# Deployment target — override via env, or edit the defaults for your project.
PROJECT_ID="${PROJECT_ID:-my-gcp-project}"
REGION="${REGION:-us-central1}"
FUNCTION_NAME="transcode-and-upload"
FUNCTION_DIR="functions/transcode-and-upload"

echo "═══════════════════════════════════════════════"
echo "  Deploying: ${FUNCTION_NAME}"
echo "  Project:   ${PROJECT_ID}"
echo "  Region:    ${REGION}"
echo "═══════════════════════════════════════════════"

# Step 1: Build TypeScript
echo ""
echo "▸ Building TypeScript..."
cd "${FUNCTION_DIR}"
npm ci
npm run build
cd ../..

echo ""
echo "▸ Deploying to Cloud Run (gen2)..."
# Note: the function must be publicly invokable (the app calls it over HTTP),
# and it enforces its own auth via the x-api-key header (TRANSCODE_API_KEY).
# On your FIRST deploy, add --allow-unauthenticated below. If your GCP org
# policy (domain-restricted sharing) blocks that flag, grant the allUsers
# invoker binding once via the console instead; subsequent deploys keep the
# existing IAM policy, so the flag can then stay omitted.
gcloud functions deploy "${FUNCTION_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --gen2 \
    --runtime=nodejs20 \
    --source="${FUNCTION_DIR}" \
    --entry-point=transcodeAndUpload \
    --trigger-http \
    --memory=2Gi \
    --timeout=540s \
    --set-build-env-vars=GOOGLE_NODE_RUN_SCRIPTS=""

echo ""
echo "═══════════════════════════════════════════════"
echo "  ✓ Deployment complete!"
echo ""
echo "  Function URL will be printed above."
echo "  Add it to .env.local as:"
echo "    VIDEO_TRANSCODE_FUNCTION_URL=<url>"
echo ""
echo "  And to Vercel environment variables."
echo "═══════════════════════════════════════════════"
