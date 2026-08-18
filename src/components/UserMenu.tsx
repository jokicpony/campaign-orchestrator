'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useConnectionHealth } from '@/hooks';

interface UserMenuProps {
    onOpenSettings?: () => void;
}

export function UserMenu({ onOpenSettings }: UserMenuProps) {
    const { user, loading, signInWithGoogle, logout } = useAuth();
    const connectionHealth = useConnectionHealth();
    const [isOpen, setIsOpen] = useState(false);
    const [imageError, setImageError] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Reset image error when the avatar URL changes (state adjustment during
    // render — see react.dev "adjusting state when a prop changes")
    const [prevPhotoURL, setPrevPhotoURL] = useState(user?.photoURL);
    if (user?.photoURL !== prevPhotoURL) {
        setPrevPhotoURL(user?.photoURL);
        setImageError(false);
    }

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (loading) {
        return (
            <div className="w-9 h-9 rounded-full bg-surface-secondary animate-pulse" />
        );
    }

    if (!user) {
        return (
            <button
                onClick={signInWithGoogle}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white font-medium transition-colors"
            >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
            </button>
        );
    }

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative flex items-center gap-2 p-1 pr-2 rounded-full bg-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
                {user.photoURL && !imageError ? (
                    <img
                        src={user.photoURL}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => setImageError(true)}
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                    </div>
                )}
                <ChevronDown className={`w-4 h-4 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                {connectionHealth.hasIssues && (
                    <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse border-2 border-background-secondary" />
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a2e] border border-border-primary rounded-xl shadow-xl overflow-hidden z-50"
                    >
                        {/* User Info */}
                        <div className="p-4 border-b border-border-primary">
                            <p className="font-medium text-foreground truncate">
                                {user.displayName || 'User'}
                            </p>
                            <p className="text-sm text-foreground-muted truncate">
                                {user.email}
                            </p>
                        </div>

                        {/* Menu Items */}
                        <div className="p-2">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onOpenSettings?.();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors text-left"
                            >
                                <Settings className="w-4 h-4 text-foreground-muted" />
                                <span className="text-sm">Settings</span>
                                {connectionHealth.hasIssues && (
                                    <span className="ml-auto w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    logout();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-colors text-left text-red-400"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="text-sm">Sign Out</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
