'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { startMetaOAuth } from '@/lib/meta/startMetaOAuth';

interface Service {
    id: string;
    name: string;
    icon: React.ReactNode;
    status: 'connected' | 'disconnected' | 'loading' | 'error';
    detail?: string;
    reconnect?: () => void;
}

interface ConnectionStatusProps {
    onAllConnected?: (allConnected: boolean) => void;
}

export function ConnectionStatus({ onAllConnected }: ConnectionStatusProps) {
    const { user, driveAccessToken, reconnectDrive } = useAuth();
    const [metaService, setMetaService] = useState<Service>({
        id: 'meta',
        name: 'Meta Ads',
        icon: <MetaIcon />,
        status: 'loading',
    });
    const [driveReconnecting, setDriveReconnecting] = useState(false);
    const [driveReconnectError, setDriveReconnectError] = useState(false);

    const updateService = useCallback((id: string, status: Service['status'], detail?: string) => {
        if (id !== 'meta') return;
        setMetaService(prev => ({ ...prev, status, detail }));
    }, []);

    // Drive status derives directly from the token — no state sync needed
    const driveService: Service = {
        id: 'drive',
        name: 'Google Drive',
        icon: <DriveIcon />,
        status: driveReconnecting
            ? 'loading'
            : driveReconnectError
                ? 'error'
                : driveAccessToken
                    ? 'connected'
                    : 'disconnected',
        detail: driveReconnecting
            ? undefined
            : driveReconnectError
                ? 'Reconnect failed'
                : driveAccessToken
                    ? 'Ready for asset access'
                    : 'Reconnect for assets',
    };
    const services: Service[] = [metaService, driveService];

    // Check Meta connection
    useEffect(() => {
        async function checkMeta() {
            if (!user) {
                updateService('meta', 'disconnected', 'Not signed in');
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
                        const accountName = data.adAccounts?.find(
                            (a: { id: string }) => a.id === data.selectedAdAccountId
                        )?.name;
                        updateService('meta', 'connected', accountName || data.userName);
                    } else {
                        updateService('meta', 'error', 'Token expired');
                    }
                } else {
                    updateService('meta', 'disconnected', 'Not connected');
                }
            } catch (err) {
                console.error('Failed to check Meta connection:', err);
                updateService('meta', 'error', 'Check failed');
            }
        }

        checkMeta();
    }, [user]);

    // Notify parent when all connected
    useEffect(() => {
        const allConnected = services.every(s => s.status === 'connected');
        onAllConnected?.(allConnected);
    }, [services, onAllConnected]);

    const handleMetaReconnect = async () => {
        try {
            await startMetaOAuth();
        } catch (err) {
            console.error('Failed to start Meta reconnect:', err);
        }
    };

    const handleDriveReconnect = async () => {
        setDriveReconnecting(true);
        setDriveReconnectError(false);
        try {
            await reconnectDrive();
        } catch {
            setDriveReconnectError(true);
        } finally {
            setDriveReconnecting(false);
        }
    };

    const allConnected = services.every(s => s.status === 'connected');
    const hasIssues = services.some(s => s.status === 'disconnected' || s.status === 'error');

    return (
        <div className={`p-4 rounded-xl border ${allConnected
                ? 'bg-green-500/5 border-green-500/20'
                : hasIssues
                    ? 'bg-amber-500/5 border-amber-500/20'
                    : 'bg-background-tertiary border-border'
            }`}>
            <div className="flex items-center gap-2 mb-3">
                {allConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : hasIssues ? (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-foreground-muted" />
                )}
                <span className="text-sm font-medium text-foreground">
                    {allConnected
                        ? 'All services connected'
                        : hasIssues
                            ? 'Some services need attention'
                            : 'Checking connections...'}
                </span>
            </div>

            <div className="flex gap-3">
                {services.map(service => (
                    <div
                        key={service.id}
                        className="flex-1 flex items-center gap-3 p-3 rounded-lg bg-background border border-border"
                    >
                        <div className="w-8 h-8 rounded-lg bg-background-tertiary flex items-center justify-center">
                            {service.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                    {service.name}
                                </span>
                                {service.status === 'connected' && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                )}
                                {service.status === 'loading' && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground-muted" />
                                )}
                                {(service.status === 'disconnected' || service.status === 'error') && (
                                    <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                                )}
                            </div>
                            {service.detail && (
                                <p className="text-xs text-foreground-muted truncate">
                                    {service.detail}
                                </p>
                            )}
                        </div>
                        {(service.status === 'disconnected' || service.status === 'error') && (
                            <button
                                onClick={() => {
                                    if (service.id === 'meta') handleMetaReconnect();
                                    if (service.id === 'drive') handleDriveReconnect();
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-500 hover:bg-cyan-500/10 rounded transition-colors"
                            >
                                <RefreshCw className="w-3 h-3" />
                                Connect
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Meta (Facebook) icon
function MetaIcon() {
    return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" className="text-[#1877F2]" />
        </svg>
    );
}

// Google Drive icon
function DriveIcon() {
    return (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path d="M7.71 15.965l1.49 2.578L2 18.543l1.51-2.578h4.2z" fill="#4285F4" />
            <path d="M9.2 5.543l-4.2 7.265H1.5L5.7 5.543h3.5z" fill="#FBBC04" />
            <path d="M8.5 5.543h4.2l4.2 7.265h-4.2l-4.2-7.265z" fill="#34A853" />
            <path d="M12.7 5.543l4.2 7.265 1.51 2.578-4.2.001L12.7 5.543z" fill="#EA4335" />
            <path d="M18.41 15.386l1.51 2.578H15.2l1.49-2.578h1.72z" fill="#4285F4" />
            <path d="M16.91 12.808l-2.19-3.79 1.74-3.01 4.2 7.265-1.51 2.578-2.24-3.043z" fill="#188038" />
        </svg>
    );
}
