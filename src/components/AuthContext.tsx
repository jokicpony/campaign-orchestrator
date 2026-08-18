'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { initializeUserDocument } from '@/lib/firebase/firestore';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    driveAccessToken: string | null;
    signInWithGoogle: () => Promise<void>;
    reconnectDrive: () => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
    children: ReactNode;
}

// ── Drive token persistence ─────────────────────────────────────────
// Google OAuth access tokens from signInWithPopup last ~1 hour, but holding
// them only in React state forced a re-auth popup on every page reload.
// Persist alongside an expiry so reloads within the token's lifetime keep
// working; reconnect is only needed when the token actually expires.
const DRIVE_TOKEN_KEY = 'mco.driveToken';
const DRIVE_TOKEN_TTL_MS = 55 * 60 * 1000; // Google issues 60-min tokens; refresh 5 min early

function persistDriveToken(token: string) {
    try {
        localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({
            token,
            expiresAt: Date.now() + DRIVE_TOKEN_TTL_MS,
        }));
    } catch { /* storage unavailable (private mode) — degrade to in-memory */ }
}

function loadPersistedDriveToken(): string | null {
    try {
        const raw = localStorage.getItem(DRIVE_TOKEN_KEY);
        if (!raw) return null;
        const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number };
        if (!token || typeof expiresAt !== 'number' || Date.now() >= expiresAt) {
            localStorage.removeItem(DRIVE_TOKEN_KEY);
            return null;
        }
        return token;
    } catch {
        return null;
    }
}

function clearPersistedDriveToken() {
    try {
        localStorage.removeItem(DRIVE_TOKEN_KEY);
    } catch { /* ignore */ }
}

// The video proxy is consumed via <video src>, which can't carry an
// Authorization header. Mirror the Drive token into a cookie scoped to that
// one path so it never appears in URLs (query strings land in access logs).
const DRIVE_PROXY_COOKIE = 'mco_drive_token';
const DRIVE_PROXY_PATH = '/api/video-proxy';

function syncDriveProxyCookie(token: string | null) {
    try {
        if (token) {
            const secure = window.location.protocol === 'https:' ? '; Secure' : '';
            document.cookie = `${DRIVE_PROXY_COOKIE}=${encodeURIComponent(token)}; path=${DRIVE_PROXY_PATH}; max-age=3300; SameSite=Strict${secure}`;
        } else {
            document.cookie = `${DRIVE_PROXY_COOKIE}=; path=${DRIVE_PROXY_PATH}; max-age=0; SameSite=Strict`;
        }
    } catch { /* ignore */ }
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [driveAccessToken, setDriveAccessToken] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            setUser(firebaseUser);
            // Restore a still-valid Drive token across page reloads
            if (firebaseUser) {
                const persisted = loadPersistedDriveToken();
                if (persisted) {
                    setDriveAccessToken(current => current ?? persisted);
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // Keep the video-proxy cookie in lockstep with the token
    useEffect(() => {
        syncDriveProxyCookie(driveAccessToken);
    }, [driveAccessToken]);

    const signInWithGoogle = useCallback(async () => {
        const provider = new GoogleAuthProvider();
        // Drive scopes for asset access
        // drive: Full read/write access (needed for Shared Drive files AND renaming)
        // Note: drive.file only works for files opened via picker, which doesn't cover Shared Drives
        provider.addScope('https://www.googleapis.com/auth/drive');
        try {
            const result = await signInWithPopup(auth, provider);

            // Capture Drive access token from OAuth credential
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setDriveAccessToken(credential.accessToken);
                persistDriveToken(credential.accessToken);
            }

            // Initialize user document in Firestore on first sign-in
            if (result.user) {
                await initializeUserDocument(
                    result.user.uid,
                    result.user.displayName || 'User',
                    result.user.email || '',
                    result.user.photoURL || undefined
                );
            }
        } catch (error) {
            console.error('Sign-in failed:', error);
            throw error;
        }
    }, []);

    // Reconnect Drive when token expires (triggers new OAuth popup)
    const reconnectDrive = useCallback(async () => {
        const provider = new GoogleAuthProvider();
        // Same full drive scope as sign-in
        provider.addScope('https://www.googleapis.com/auth/drive');
        try {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setDriveAccessToken(credential.accessToken);
                persistDriveToken(credential.accessToken);
            }
        } catch (error) {
            console.error('Drive reconnect failed:', error);
            throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            await signOut(auth);
            setDriveAccessToken(null);
            clearPersistedDriveToken();
        } catch (error) {
            console.error('Sign-out failed:', error);
            throw error;
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, driveAccessToken, signInWithGoogle, reconnectDrive, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
