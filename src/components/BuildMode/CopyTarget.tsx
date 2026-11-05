'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { CopyItem } from '@/types';

/**
 * The selected ad, as every copy card sees it: Top Performers, Active and the
 * copywriter's results all add to the same ad with the same Use button.
 */
export interface UseCopyResult {
    ok: boolean;
    message: string;
}

export interface CopyTarget {
    /** e.g. "02 · Angle 2"; null when there are no ads yet. */
    label: string | null;
    /** Where this copy would land in the selected ad: already there, no free slot, or a free slot. */
    placeFor: (item: Pick<CopyItem, 'type' | 'text'>) => 'in' | 'full' | 'free' | null;
    /** Put it in the selected ad's next empty slot of its type (it also joins Active). */
    use: (item: CopyItem) => UseCopyResult;
}

export function UseButton({ item, target, onResult }: {
    item: CopyItem;
    target: CopyTarget;
    onResult?: (result: UseCopyResult) => void;
}) {
    const place = target.placeFor(item);
    if (place === 'in') {
        return (
            <span className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium text-green-400" title={`Already in ${target.label}`}>
                <Check className="w-3 h-3" /> In ad
            </span>
        );
    }
    return (
        <button
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onResult?.(target.use(item)); }}
            disabled={place === null}
            title={place === null ? 'Add an ad first'
                : place === 'full' ? `${item.type === 'headline' ? 'Headline' : 'Primary text'} slots in ${target.label} are full`
                    : `Add to ${target.label}`}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${place === 'full'
                ? 'bg-background text-foreground-subtle hover:text-foreground'
                : 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25'}`}
        >
            {place === 'full' ? 'Full' : 'Use'}
        </button>
    );
}

/** A short note under the card that was just used ("Added to 02 · Headline 3"), cleared after a few seconds. */
export function useUseNote() {
    const [note, setNote] = useState<(UseCopyResult & { id: string }) | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const show = useCallback((id: string, result: UseCopyResult) => {
        setNote({ id, ...result });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setNote(null), 4000);
    }, []);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    return [note, show] as const;
}

export function UseNote({ note, id }: { note: (UseCopyResult & { id: string }) | null; id: string }) {
    if (!note || note.id !== id) return null;
    return <p className={`mt-1 text-[11px] ${note.ok ? 'text-green-400/80' : 'text-amber-400'}`}>{note.message}</p>;
}
