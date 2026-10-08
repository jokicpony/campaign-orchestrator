'use client';

import React from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import type { Asset } from '@/types';
import { buildStacks, VARIANT_LABELS } from '@/lib/meta/multiMedia';

interface MediaStacksProps {
    assets: Asset[];
    size?: 'sm' | 'md';
}

const thumbSrc = (asset: Asset) => asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl;

/**
 * Multi-media stacks, drawn like Ads Manager's "Uploaded media": orientation
 * variants of one creative overlap as a single stack; videos and unmatched
 * images stand alone. Uses the same buildStacks the publish wizard sends.
 */
export function MediaStacks({ assets, size = 'md' }: MediaStacksProps) {
    const stacks = buildStacks(assets);
    const card = size === 'sm' ? 'w-7 h-7' : 'w-14 h-14';
    const offset = size === 'sm' ? 4 : 8;

    return (
        <div className={`flex flex-wrap ${size === 'sm' ? 'gap-x-2 gap-y-1.5' : 'gap-x-4 gap-y-3'}`}>
            {stacks.map((stack, i) => {
                const label = stack.members.length > 1
                    ? stack.variants.map(v => v && VARIANT_LABELS[v]).join(' + ')
                    : assets[stack.members[0]].type === 'video'
                        ? 'Video'
                        : stack.variants[0] ? VARIANT_LABELS[stack.variants[0]] : 'Size?';
                const spread = (stack.members.length - 1) * offset;
                const names = stack.members.map(m => assets[m].name).join(', ');
                const isLead = stack.members.includes(0); // assets[0] is the ad's lead media
                return (
                    <div key={i} className="flex flex-col items-center" title={names} aria-label={`${label}: ${names}${isLead ? ' (lead)' : ''}`}>
                        <div className="relative" style={{ width: `calc(${size === 'sm' ? '1.75rem' : '3.5rem'} + ${spread}px)`, height: `calc(${size === 'sm' ? '1.75rem' : '3.5rem'} + ${spread}px)` }}>
                            {/* Back-to-front so the first member sits on top, bottom-left — like Ads Manager */}
                            {[...stack.members].reverse().map((m, depth) => {
                                const asset = assets[m];
                                const position = stack.members.length - 1 - depth; // 0 = front
                                const src = thumbSrc(asset);
                                return (
                                    <div
                                        key={m}
                                        className={`absolute ${card} rounded-md overflow-hidden bg-background border border-border shadow-sm`}
                                        style={{ left: position * offset, top: spread - position * offset }}
                                    >
                                        {src ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={src} alt={asset.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                {asset.type === 'video'
                                                    ? <Film className="w-3 h-3 text-foreground-muted" />
                                                    : <ImageIcon className="w-3 h-3 text-foreground-muted" />}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <span className={`mt-0.5 leading-tight whitespace-nowrap ${isLead ? 'text-accent-primary font-semibold' : 'text-foreground-muted'} ${size === 'sm' ? 'text-[8px]' : 'text-[10px]'}`}>
                            {isLead && size === 'md' ? `Lead · ${label}` : label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
