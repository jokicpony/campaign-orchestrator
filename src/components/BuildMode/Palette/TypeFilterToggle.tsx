'use client';

import React from 'react';
import { COPY_TYPE } from '@/components/copyType';

export type TypeFilter = 'all' | 'headline' | 'primary_text';

interface TypeFilterToggleProps {
    value: TypeFilter;
    onChange: (value: TypeFilter) => void;
    headlineCount: number;
    primaryTextCount: number;
}

export function TypeFilterToggle({ value, onChange, headlineCount, primaryTextCount }: TypeFilterToggleProps) {
    const options: { id: TypeFilter; label: string; count: number; title: string; picked: string; idle: string }[] = [
        { id: 'all', label: 'All', count: headlineCount + primaryTextCount, title: 'Show all', picked: 'bg-background text-foreground shadow-sm', idle: 'text-foreground-muted hover:text-foreground' },
        { id: 'headline', label: 'Headline', count: headlineCount, title: 'Headlines only', picked: COPY_TYPE.headline.picked, idle: `${COPY_TYPE.headline.text} opacity-70 hover:opacity-100` },
        { id: 'primary_text', label: 'Primary', count: primaryTextCount, title: 'Primary text only', picked: COPY_TYPE.primary_text.picked, idle: `${COPY_TYPE.primary_text.text} opacity-70 hover:opacity-100` },
    ];
    return (
        <div className="flex items-center gap-1 bg-background-tertiary rounded-lg p-0.5">
            {options.map(o => (
                <button
                    key={o.id}
                    onClick={() => onChange(o.id)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${value === o.id ? o.picked : o.idle}`}
                    title={o.title}
                    aria-pressed={value === o.id}
                >
                    {o.label} ({o.count})
                </button>
            ))}
        </div>
    );
}
