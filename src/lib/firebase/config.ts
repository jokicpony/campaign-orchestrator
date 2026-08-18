import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// NEXT_PUBLIC_* values are inlined at build time. On a fresh clone with no env
// configured yet, `next build` would crash during prerender — getAuth and
// getFirestore are the two init-time validators (they throw on a missing
// apiKey/projectId) — so exactly those two keys fall back to an
// obviously-invalid sentinel. The sentinel is never a real domain or project,
// so a misbuilt bundle cannot route traffic into a namespace someone else
// could register. A bundle built without env still fails LOUDLY in the
// browser: the console.error below names the problem on load, and sign-in
// rejects with auth/invalid-api-key. The fix is to set the env vars and
// REBUILD — setting them at runtime cannot reach an already-built client
// bundle.
const MISSING = 'firebase-env-missing';

const firebaseConfig = {
    // `||` (not `??`) so a declared-but-empty var (`VAR=`) also falls back.
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || MISSING,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || MISSING,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (
    typeof window !== 'undefined' &&
    (firebaseConfig.apiKey === MISSING || firebaseConfig.projectId === MISSING)
) {
    console.error(
        '[firebase] This bundle was BUILT without NEXT_PUBLIC_FIREBASE_* env vars ' +
            '(see .env.example). Sign-in and data access will not work. Set the ' +
            'variables and rebuild — setting them at runtime is not enough, because ' +
            'NEXT_PUBLIC_* values are baked in at build time.'
    );
}

// Singleton pattern for Next.js (prevents multiple instances during hot reload)
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);

export { app, auth, db };
export default app;
