'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { doc, getDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MetaConnection } from '@/lib/meta/types';
import { consumeMetaCallback } from '@/lib/meta/callbackParams';
import { startMetaOAuth } from '@/lib/meta/startMetaOAuth';
import { authedFetch } from '@/lib/api/authedFetch';
import { getGlobalSettings, updateGlobalSettings } from '@/lib/firebase/firestore';
import {
    User,
    Link2,
    Link2Off,
    CheckCircle2,
    AlertCircle,
    LogOut,
    RefreshCw,
    Sparkles,
    ChevronDown,
    Star,
} from 'lucide-react';

export function ConnectionsSettings() {
    const { user, driveAccessToken, logout, reconnectDrive } = useAuth();
    const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null);
    const [metaLoading, setMetaLoading] = useState(true);
    const [metaError, setMetaError] = useState<string | null>(null);
    const [isReconnectingDrive, setIsReconnectingDrive] = useState(false);
    const [geminiConfigured, setGeminiConfigured] = useState(false);
    const [adAccountDropdownOpen, setAdAccountDropdownOpen] = useState(false);
    const [pageDropdownOpen, setPageDropdownOpen] = useState(false);
    const [defaultAdAccountId, setDefaultAdAccountId] = useState<string | undefined>(undefined);

    // Load default ad account from shared global settings
    useEffect(() => {
        async function loadDefault() {
            try {
                const settings = await getGlobalSettings();
                setDefaultAdAccountId(settings.defaultAdAccountId);
            } catch (err) {
                console.error('Failed to load default ad account:', err);
            }
        }
        loadDefault();
    }, []);

    // Check if Gemini API key is configured via server API
    useEffect(() => {
        async function checkGemini() {
            try {
                const response = await fetch('/api/ai/generate');
                const data = await response.json();
                setGeminiConfigured(data.configured === true);
            } catch {
                setGeminiConfigured(false);
            }
        }
        checkGemini();
    }, []);

    // Load Meta connection status
    useEffect(() => {
        async function loadMetaConnection() {
            if (!user) {
                setMetaLoading(false);
                return;
            }

            try {
                const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let expiresAt: Date;
                    if (data.tokenExpiresAt?.toDate) {
                        expiresAt = data.tokenExpiresAt.toDate();
                    } else {
                        expiresAt = new Date(data.tokenExpiresAt);
                    }

                    if (expiresAt > new Date()) {
                        setMetaConnection({
                            ...data,
                            tokenExpiresAt: expiresAt,
                            connectedAt: data.connectedAt?.toDate?.() || new Date(data.connectedAt),
                        } as MetaConnection);
                    } else {
                        setMetaError('Connection expired');
                    }
                }
            } catch (err) {
                console.error('Failed to load Meta connection:', err);
                setMetaError('Failed to load');
            } finally {
                setMetaLoading(false);
            }
        }

        loadMetaConnection();
    }, [user]);

    // Handle OAuth callback from URL (after redirect from Meta)
    useEffect(() => {
        async function handleOAuthCallback() {
            if (!user) return;

            const result = consumeMetaCallback();
            if (!result) return;

            if (result.error) {
                setMetaError(result.error);
                return;
            }

            if (result.connection) {
                try {
                    const connectionData = result.connection;

                    // Auto-select the org default ad account if one is configured
                    try {
                        const settings = await getGlobalSettings();
                        if (settings.defaultAdAccountId) {
                            const defaultExists = connectionData.adAccounts.some(
                                acc => acc.id === settings.defaultAdAccountId
                            );
                            if (defaultExists) {
                                connectionData.selectedAdAccountId = settings.defaultAdAccountId;
                            }
                        }
                    } catch { /* proceed with server default */ }

                    // Store in Firestore
                    const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
                    await setDoc(docRef, connectionData);

                    setMetaConnection(connectionData);
                    setMetaError(null);
                    setMetaLoading(false);
                } catch (err) {
                    console.error('Failed to save Meta connection:', err);
                    setMetaError('Failed to save connection data');
                }
            }
        }

        handleOAuthCallback();
    }, [user]);

    const handleMetaConnect = async () => {
        try {
            await startMetaOAuth();
        } catch (err) {
            setMetaError(err instanceof Error ? err.message : 'Failed to start Meta sign-in');
        }
    };

    const handleMetaDisconnect = async () => {
        if (!user) return;
        // Revoke the server-side token first so "Disconnect" actually
        // invalidates the credential, then clear the local metadata regardless.
        try {
            await authedFetch('/api/auth/meta', { method: 'DELETE' });
        } catch (err) {
            console.error('Failed to revoke server Meta token:', err);
        }
        try {
            const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
            await deleteDoc(docRef);
            setMetaConnection(null);
        } catch (err) {
            console.error('Failed to disconnect Meta:', err);
        }
    };

    const handleReconnectDrive = async () => {
        setIsReconnectingDrive(true);
        try {
            await reconnectDrive();
        } catch (err) {
            console.error('Failed to reconnect Drive:', err);
        } finally {
            setIsReconnectingDrive(false);
        }
    };

    const handleSelectAdAccount = async (accountId: string) => {
        if (!user || !metaConnection) return;
        try {
            const updatedConnection = {
                ...metaConnection,
                selectedAdAccountId: accountId,
            };
            const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
            await setDoc(docRef, updatedConnection);
            setMetaConnection(updatedConnection);
            setAdAccountDropdownOpen(false);
        } catch (err) {
            console.error('Failed to update ad account:', err);
        }
    };

    const handleSetDefaultAdAccount = async (accountId: string) => {
        try {
            await updateGlobalSettings({ defaultAdAccountId: accountId });
            setDefaultAdAccountId(accountId);
        } catch (err) {
            console.error('Failed to set default ad account:', err);
        }
    };

    const handleSelectPage = async (pageId: string) => {
        if (!user || !metaConnection) return;
        try {
            const updatedConnection = {
                ...metaConnection,
                selectedPageId: pageId,
            };
            const docRef = doc(db, 'users', user.uid, 'integrations', 'meta');
            await setDoc(docRef, updatedConnection);
            setMetaConnection(updatedConnection);
            setPageDropdownOpen(false);
        } catch (err) {
            console.error('Failed to update page:', err);
        }
    };

    const selectedAdAccount = metaConnection?.adAccounts.find(
        (acc) => acc.id === metaConnection.selectedAdAccountId
    );

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Connections</h3>
                <p className="text-sm text-foreground-muted">
                    Manage your account and integration connections
                </p>
            </div>

            <div className="space-y-4">
                {/* Google Account */}
                <div className="p-4 rounded-xl border border-border bg-background-secondary">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-5 h-5 text-foreground-muted" />
                                )}
                            </div>
                            <div>
                                <p className="font-medium text-foreground">{user?.displayName || 'User'}</p>
                                <p className="text-sm text-foreground-muted">{user?.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent-success/20 text-accent-success text-xs font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                Connected
                            </span>
                            <button
                                onClick={logout}
                                className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                                title="Sign out"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Google Drive status */}
                    <div className="mt-3 pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-foreground-muted">Google Drive Access</span>
                                {driveAccessToken ? (
                                    <span className="flex items-center gap-1 text-xs text-accent-success">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Active
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-xs text-amber-500">
                                        <AlertCircle className="w-3 h-3" />
                                        Session expired
                                    </span>
                                )}
                            </div>
                            {!driveAccessToken && (
                                <button
                                    onClick={handleReconnectDrive}
                                    disabled={isReconnectingDrive}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-background-tertiary hover:bg-background text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3 h-3 ${isReconnectingDrive ? 'animate-spin' : ''}`} />
                                    Reconnect
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Meta Business */}
                <div className="p-4 rounded-xl border border-border bg-background-secondary">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#1877F2]/20 flex items-center justify-center">
                                <Link2 className="w-5 h-5 text-[#1877F2]" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Meta Business</p>
                                {metaLoading ? (
                                    <p className="text-sm text-foreground-muted">Loading...</p>
                                ) : metaConnection ? (
                                    <p className="text-sm text-foreground-muted">
                                        {metaConnection.userName}
                                    </p>
                                ) : (
                                    <p className="text-sm text-foreground-muted">Not connected</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {metaLoading ? null : metaConnection ? (
                                <>
                                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent-success/20 text-accent-success text-xs font-medium">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Connected
                                    </span>
                                    <button
                                        onClick={handleMetaDisconnect}
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-400 transition-colors"
                                        title="Disconnect"
                                    >
                                        <Link2Off className="w-4 h-4" />
                                    </button>
                                </>
                            ) : metaError ? (
                                <button
                                    onClick={handleMetaConnect}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 text-sm font-medium transition-colors"
                                >
                                    <AlertCircle className="w-4 h-4" />
                                    Reconnect
                                </button>
                            ) : (
                                <button
                                    onClick={handleMetaConnect}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-medium transition-colors"
                                >
                                    <Link2 className="w-4 h-4" />
                                    Connect
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Ad Account and Page selectors */}
                    {metaConnection && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                            {/* Ad Account Selector */}
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground-muted">Ad Account</span>
                                {metaConnection.adAccounts.length > 1 ? (
                                    <div className="relative">
                                        <button
                                            onClick={() => { setAdAccountDropdownOpen(!adAccountDropdownOpen); setPageDropdownOpen(false); }}
                                            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-background-tertiary transition-colors text-sm text-foreground"
                                        >
                                            {selectedAdAccount?.name || 'None selected'}
                                            <ChevronDown className={`w-3.5 h-3.5 text-foreground-muted transition-transform ${adAccountDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {adAccountDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setAdAccountDropdownOpen(false)} />
                                                <div className="absolute right-0 top-full mt-1 w-64 bg-background-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                                                    <p className="px-3 py-2 text-xs text-foreground-muted uppercase tracking-wider border-b border-border/50">
                                                        Select Ad Account
                                                    </p>
                                                    <div className="max-h-48 overflow-y-auto">
                                                        {metaConnection.adAccounts.map((account) => (
                                                            <div
                                                                key={account.id}
                                                                className={`flex items-center justify-between px-3 py-2 hover:bg-background-tertiary transition-colors ${account.id === metaConnection.selectedAdAccountId
                                                                    ? 'bg-accent-primary/10'
                                                                    : ''
                                                                    }`}
                                                            >
                                                                <button
                                                                    onClick={() => handleSelectAdAccount(account.id)}
                                                                    className="flex-1 text-left"
                                                                >
                                                                    <p className="text-sm text-foreground">{account.name}</p>
                                                                    {account.businessName && (
                                                                        <p className="text-xs text-foreground-muted">{account.businessName}</p>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleSetDefaultAdAccount(account.id); }}
                                                                    className={`ml-2 p-1 rounded transition-colors ${account.id === defaultAdAccountId
                                                                        ? 'text-amber-400'
                                                                        : 'text-foreground-muted/30 hover:text-amber-400/60'
                                                                        }`}
                                                                    title={account.id === defaultAdAccountId ? 'Default account' : 'Set as default for all users'}
                                                                >
                                                                    <Star className={`w-3.5 h-3.5 ${account.id === defaultAdAccountId ? 'fill-current' : ''}`} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm text-foreground">
                                        {selectedAdAccount?.name || 'None selected'}
                                    </span>
                                )}
                            </div>

                            {/* Page Selector */}
                            {metaConnection.pages && metaConnection.pages.length > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-foreground-muted">Publishing Page</span>
                                    {metaConnection.pages.length > 1 ? (
                                        <div className="relative">
                                            <button
                                                onClick={() => { setPageDropdownOpen(!pageDropdownOpen); setAdAccountDropdownOpen(false); }}
                                                className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-background-tertiary transition-colors text-sm text-foreground"
                                            >
                                                {metaConnection.pages.find(p => p.id === metaConnection.selectedPageId)?.name || 'None selected'}
                                                <ChevronDown className={`w-3.5 h-3.5 text-foreground-muted transition-transform ${pageDropdownOpen ? 'rotate-180' : ''}`} />
                                            </button>
                                            {pageDropdownOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={() => setPageDropdownOpen(false)} />
                                                    <div className="absolute right-0 top-full mt-1 w-64 bg-background-secondary border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                                                        <p className="px-3 py-2 text-xs text-foreground-muted uppercase tracking-wider border-b border-border/50">
                                                            Select Publishing Page
                                                        </p>
                                                        <div className="max-h-48 overflow-y-auto">
                                                            {metaConnection.pages.map((page) => (
                                                                <button
                                                                    key={page.id}
                                                                    onClick={() => handleSelectPage(page.id)}
                                                                    className={`w-full px-3 py-2 text-left hover:bg-background-tertiary transition-colors ${page.id === metaConnection.selectedPageId
                                                                        ? 'bg-blue-500/10'
                                                                        : ''
                                                                        }`}
                                                                >
                                                                    <p className="text-sm text-foreground">{page.name}</p>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-sm text-foreground">
                                            {metaConnection.pages.find(p => p.id === metaConnection.selectedPageId)?.name || 'None selected'}
                                        </span>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-foreground-muted">Connected</span>
                                <span className="text-sm text-foreground">
                                    {metaConnection.connectedAt.toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* AI Engine */}
                <div className="p-4 rounded-xl border border-border bg-background-secondary">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <Sparkles className="w-5 h-5 text-purple-400" />
                            </div>
                            <div>
                                <p className="font-medium text-foreground">AI Engine</p>
                                <p className="text-sm text-foreground-muted">
                                    Powers AI Co-Writer copy generation
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {geminiConfigured ? (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent-success/20 text-accent-success text-xs font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Ready
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                                    <AlertCircle className="w-3 h-3" />
                                    No env keys
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-xs text-foreground-muted">
                            Manage API keys and select your AI provider in Settings → Brand Voice.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
