'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Info icon + hover tooltip explaining how carousel cards are assembled.
 * Shown next to the ad type wherever a carousel row appears (Build Mode and
 * Review Mode) so the position-based pairing is never a surprise.
 *
 * Matches the app's existing tooltip treatment (black/90, 10px text) and
 * renders through a portal so it escapes overflow-hidden containers.
 */

export const CAROUSEL_PAIRING_HINT =
    'Cards pair by position: Card 1 = Asset 1 + Headline 1, Card 2 = Asset 2 + Headline 2, and so on. ' +
    'Primary Text 1 is the single message shown above all cards. 2–10 cards per carousel — ' +
    'headline slots grow to match your cards beyond 5.';

export function CarouselPairingHint({ className = '' }: { className?: string }) {
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [hovered, setHovered] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (hovered && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPos({
                top: rect.top - 8,
                left: rect.left + rect.width / 2,
            });
        }
    }, [hovered]);

    return (
        <>
            <span
                ref={triggerRef}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={`inline-flex items-center cursor-help ${className}`}
            >
                <Info className="w-3.5 h-3.5 text-amber-400" />
            </span>
            {hovered && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: pos.top,
                        left: pos.left,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 9999,
                    }}
                    className="px-2.5 py-1.5 rounded bg-black/90 text-white text-[10px] leading-snug max-w-[260px] text-left pointer-events-none"
                >
                    {CAROUSEL_PAIRING_HINT}
                </div>,
                document.body
            )}
        </>
    );
}
