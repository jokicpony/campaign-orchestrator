'use client';

import React from 'react';

export type TypeFilter = 'all' | 'headline' | 'primary_text';

interface TypeFilterToggleProps {
    value: TypeFilter;
    onChange: (value: TypeFilter) => void;
    headlineCount: number;
    primaryTextCount: number;
}

export function TypeFilterToggle({ value, onChange, headlineCount, primaryTextCount }: TypeFilterToggleProps) {
    const totalCount = headlineCount + primaryTextCount;

    return (
        <div className="flex items-center gap-1 bg-background-tertiary rounded-lg p-0.5">
            <button
                onClick={() => onChange('all')}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${value === 'all'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                    }`}
                title="Show all"
            >
                All ({totalCount})
            </button>
            <button
                onClick={() => onChange('headline')}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${value === 'headline'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                    }`}
                title="Headlines only"
            >
                Headline ({headlineCount})
            </button>
            <button
                onClick={() => onChange('primary_text')}
                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${value === 'primary_text'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-foreground-muted hover:text-foreground'
                    }`}
                title="Primary text only"
            >
                Primary ({primaryTextCount})
            </button>
        </div>
    );
}
