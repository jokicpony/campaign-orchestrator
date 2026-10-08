'use client';

import React from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import type { Asset } from '@/types';
import { buildStacks, VARIANT_LABELS } from '@/lib/meta/multiMedia';

interface MediaStacksProps {
    assets: Asset[];
    size?: 'md' | 'lg';
    /** Index into `assets` currently previewed elsewhere; its card is ringed and brought to the front. */
    selectedIndex?: number;
    /** Click a stack to preview it; clicking the previewed stack again steps through its shapes. */
    onSelect?: (assetIndex: number) => void;
}

const SIZES = {
    md: { card: 56, offset: 8, label: 'text-[10px]', gap: 'gap-x-4 gap-y-3', icon: 'w-4 h-4' },
    lg: { card: 80, offset: 10, label: 'text-[11px]', gap: 'gap-x-5 gap-y-3', icon: 'w-5 h-5' },
} as const;

const thumbSrc = (asset: Asset) => asset.permanentThumbnailUrl || asset.cachedThumbnail || asset.thumbnailUrl;

/**
 * Multi-media stacks, drawn like Ads Manager's "Uploaded media": orientation
 * variants of one creative overlap as a single stack; videos and unmatched
 * images stand alone. Uses the same buildStacks the publish wizard sends.
 */
export function MediaStacks({ assets, size = 'md', selectedIndex, onSelect }: MediaStacksProps) {
    const stacks = buildStacks(assets);
    const { card, offset, label: labelText, gap, icon } = SIZES[size];

    return (
        <div className={`flex flex-wrap items-end ${gap}`}>
            {stacks.map((stack, i) => {
                const label = stack.members.length > 1
                    ? stack.variants.map(v => v && VARIANT_LABELS[v]).join(' + ')
                    : assets[stack.members[0]].type === 'video'
                        ? 'Video'
                        : stack.variants[0] ? VARIANT_LABELS[stack.variants[0]] : 'Size?';
                const spread = (stack.members.length - 1) * offset;
                const names = stack.members.map(m => assets[m].name).join(', ');
                const isLead = stack.members.includes(0); // assets[0] is the ad's lead media
                const selectedPos = selectedIndex === undefined ? -1 : stack.members.indexOf(selectedIndex);
                // Draw the previewed member in front; the rest keep their order behind it
                const order = selectedPos > 0
                    ? [stack.members[selectedPos], ...stack.members.filter((_, p) => p !== selectedPos)]
                    : stack.members;
                const handleClick = onSelect
                    ? () => onSelect(selectedPos >= 0 ? stack.members[(selectedPos + 1) % stack.members.length] : stack.members[0])
                    : undefined;
                const Wrapper = handleClick ? 'button' : 'div';
                return (
                    <Wrapper
                        key={i}
                        {...(handleClick ? { type: 'button' as const, onClick: handleClick } : {})}
                        className={`flex flex-col items-center rounded-lg ${handleClick ? 'p-1 -m-1 hover:bg-white/5 transition-colors cursor-pointer' : ''}`}
                        title={handleClick && stack.members.length > 1 ? `${names}\nClick again to cycle shapes` : names}
                        aria-label={`${label}: ${names}${isLead ? ' (lead)' : ''}`}
                    >
                        <div className="relative" style={{ width: card + spread, height: card + spread }}>
                            {/* Back-to-front so the front member sits on top, bottom-left — like Ads Manager */}
                            {[...order].reverse().map((m, depth) => {
                                const asset = assets[m];
                                const position = order.length - 1 - depth; // 0 = front
                                const src = thumbSrc(asset);
                                const ringed = m === selectedIndex;
                                return (
                                    <div
                                        key={m}
                                        className={`absolute rounded-md overflow-hidden bg-background shadow-sm border ${ringed ? 'border-accent-primary ring-1 ring-accent-primary' : 'border-border'}`}
                                        style={{ width: card, height: card, left: position * offset, top: spread - position * offset }}
                                    >
                                        {src ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={src} alt={asset.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                {asset.type === 'video'
                                                    ? <Film className={`${icon} text-foreground-muted`} />
                                                    : <ImageIcon className={`${icon} text-foreground-muted`} />}
                                            </div>
                                        )}
                                        {asset.type === 'video' && src && (
                                            <span className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-black/60">
                                                <Film className="w-3 h-3 text-white" />
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <span className={`mt-1 leading-tight whitespace-nowrap ${isLead ? 'text-accent-primary font-semibold' : 'text-foreground-muted'} ${labelText}`}>
                            {isLead ? `Lead · ${label}` : label}
                        </span>
                    </Wrapper>
                );
            })}
        </div>
    );
}
