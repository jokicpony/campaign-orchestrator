import { Firestore } from '@google-cloud/firestore';
import { ExternalAccountClient, type AuthClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

/**
 * Server-side Firestore, authenticated WITHOUT a downloadable service-account
 * key (the org forbids them via constraints/iam.disableServiceAccountKeyCreation).
 *
 * In production on Vercel: authenticate via Workload Identity Federation. The
 * deployment's short-lived Vercel OIDC token is exchanged at Google STS for
 * credentials that impersonate the `mco-admin-sdk` service account (which holds
 * only roles/datastore.user). No secret is stored anywhere.
 *
 * Locally (no WIF env vars): fall back to Application Default Credentials —
 * run `gcloud auth application-default login` once to develop against Firestore.
 *
 * This client uses IAM, so it bypasses Firestore security rules — which is why
 * the `serverSecrets` collection can be denied to all clients in firestore.rules
 * while the backend still reads/writes it.
 */

let firestore: Firestore | null = null;

function buildExternalAuthClient(): AuthClient | null {
    const projectNumber = process.env.GCP_PROJECT_NUMBER;
    const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
    const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;

    if (!projectNumber || !saEmail || !poolId || !providerId) return null;

    return ExternalAccountClient.fromJSON({
        type: 'external_account',
        audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        token_url: 'https://sts.googleapis.com/v1/token',
        service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
        subject_token_supplier: {
            // Vercel signs this per-request; it is never persisted.
            getSubjectToken: () => getVercelOidcToken(),
        },
    });
}

export function getServerFirestore(): Firestore {
    if (firestore) return firestore;

    const projectId = process.env.GCP_PROJECT_ID;
    const authClient = buildExternalAuthClient();

    // In production the WIF env vars must be fully set. If they aren't, fail
    // loudly rather than silently falling back to ADC (which has no credentials
    // on Vercel and would only surface as an opaque error at query time).
    if (!authClient && process.env.NODE_ENV === 'production') {
        throw new Error(
            'Server Firestore is not configured for production: set GCP_PROJECT_NUMBER, ' +
            'GCP_SERVICE_ACCOUNT_EMAIL, GCP_WORKLOAD_IDENTITY_POOL_ID, and ' +
            'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID (Workload Identity Federation).'
        );
    }

    if (authClient) {
        firestore = new Firestore({ projectId, authClient });
    } else {
        // Local dev / ADC. Firestore resolves the project from ADC if unset.
        firestore = new Firestore(projectId ? { projectId } : {});
    }
    return firestore;
}
