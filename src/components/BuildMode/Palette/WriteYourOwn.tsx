'use client';

import React, { useMemo, useRef, useState } from 'react';
import { META_CHAR_LIMITS, type CopyItem } from '@/types';
import { Draggable } from '@/lib/dnd';
import { UseButton, UseNote, useUseNote, type CopyTarget } from '../CopyTarget';
import { COPY_TYPE } from '@/components/copyType';

type CopyType = CopyItem['type'];

interface WriteYourOwnProps {
    target: CopyTarget;
    /** This campaign's Active copy; the hand-written cards are listed under the box. */
    activeItems: CopyItem[];
}

/** Hand-written copy: Use puts it in the selected ad (and in Active). */
export function WriteYourOwn({ target, activeItems }: WriteYourOwnProps) {
    const [type, setType] = useState<CopyType>('headline');
    const [text, setText] = useState('');
    const [note, showNote] = useUseNote();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const style = COPY_TYPE[type];

    const trimmed = text.trim();
    const draft: CopyItem = useMemo(
        () => ({ id: 'draft', text: trimmed, type, source: 'manual', createdAt: new Date(0) }),
        [trimmed, type],
    );
    const place = trimmed ? target.placeFor(draft) : null;

    const mine = useMemo(() => activeItems.filter(i => i.source === 'manual').reverse(), [activeItems]);

    const limit = type === 'headline' ? META_CHAR_LIMITS.headline : META_CHAR_LIMITS.primaryText;
    const countClass = text.length > limit ? 'text-amber-400' : 'text-foreground-subtle';

    const done = (message: string) => {
        showNote('box', { ok: true, message });
        setText('');
        inputRef.current?.focus();
    };

    const use = () => {
        if (!trimmed) return;
        const result = target.use({ ...draft, id: `manual-${Date.now()}`, createdAt: new Date() });
        if (result.ok) done(result.message);
        else showNote('box', result);
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
            <div className="space-y-2">
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-background-tertiary" role="radiogroup" aria-label="Copy type">
                    {(['headline', 'primary_text'] as const).map(t => {
                        const s = COPY_TYPE[t];
                        return (
                            <button
                                key={t}
                                role="radio"
                                aria-checked={type === t}
                                onClick={() => { setType(t); inputRef.current?.focus(); }}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${type === t ? s.picked : `${s.text} opacity-60 hover:opacity-100`}`}
                            >
                                <s.icon className="w-3.5 h-3.5" />
                                {s.label}
                            </button>
                        );
                    })}
                </div>

                <textarea
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); use(); }
                    }}
                    rows={type === 'headline' ? 2 : 5}
                    placeholder={type === 'headline' ? 'Write a headline…' : 'Write primary text…'}
                    aria-label={`Your ${style.label.toLowerCase()}`}
                    className={`w-full px-3 py-2 rounded-lg bg-background border text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none resize-y ${style.border} ${style.focus}`}
                />

                <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${countClass}`} title={type === 'headline' ? 'Meta shows about 40 characters' : 'Meta shows about 125 characters before "See more"'}>
                        {text.length}/{limit}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                        <button
                            onClick={use}
                            disabled={!trimmed || place === null || place === 'in'}
                            title={!target.label ? 'Add an ad first'
                                : place === 'in' ? `Already in ${target.label}`
                                    : place === 'full' ? `${style.label} slots in ${target.label} are full`
                                        : `Add to ${target.label} (Enter)`}
                            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-40 transition-colors"
                        >
                            {place === 'in' ? 'In ad' : target.label ? `Use in ${target.label}` : 'Use'}
                        </button>
                    </div>
                </div>
                <UseNote note={note} id="box" />
            </div>

            {mine.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-foreground-subtle">Written by hand in this campaign</p>
                    {mine.map(item => <MineCard key={item.id} item={item} target={target} />)}
                </div>
            )}
        </div>
    );
}

function MineCard({ item, target }: { item: CopyItem; target: CopyTarget }) {
    const [note, showNote] = useUseNote();
    const style = COPY_TYPE[item.type];
    return (
        <Draggable item={item}>
            <div className={`flex items-start gap-2 p-2.5 rounded-lg border bg-background transition-colors ${style.border}`}>
                <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${style.badge}`} title={style.label}>{style.short}</span>
                <p className="flex-1 min-w-0 text-sm text-foreground whitespace-pre-wrap">{item.text}</p>
                <UseButton item={item} target={target} onResult={r => showNote(item.id, r)} />
            </div>
            <UseNote note={note} id={item.id} />
        </Draggable>
    );
}
