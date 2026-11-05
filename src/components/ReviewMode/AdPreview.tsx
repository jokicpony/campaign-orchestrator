'use client';

import React, { useState } from 'react';
import { Globe, MoreHorizontal, Shuffle } from 'lucide-react';
import { CTA_OPTIONS, type AdRow, type SlotItem } from '@/types';

/** Meta cuts feed primary text at about this many characters, behind "See more". */
const SEE_MORE_AT = 125;

/** The text publish sends for a slot (PublishWizard's getSlotText). */
function slotText(slot: SlotItem | null | undefined): string {
    if (!slot) return '';
    return slot.localText || slot.masterItem.text || '';
}

function domainOf(url: string | null | undefined): string {
    if (!url) return '';
    try {
        return new URL(url).hostname.replace(/^www\./, '').toUpperCase();
    } catch {
        return '';
    }
}

interface AdPreviewProps {
    row: AdRow;
    /** The asset (or carousel card) the media area shows. */
    assetIndex: number;
    /** The media area: image, video player or placeholder. */
    media: React.ReactNode;
}

/**
 * Roughly how the ad shows in a Facebook feed: primary text above the media,
 * then the link bar with the domain, the headline and the CTA button. Meta
 * mixes the primary texts and headlines itself; "Next mix" steps through them.
 * Carousels show the selected card with its own headline (Card N = Headline N).
 */
export function AdPreview({ row, assetIndex, media }: AdPreviewProps) {
    const [mix, setMix] = useState(0);
    const [expanded, setExpanded] = useState(false);

    const isCarousel = row.adType === 'carousel';
    const primaryTexts = (isCarousel ? row.slots.primaryTexts.slice(0, 1) : row.slots.primaryTexts).map(slotText).filter(Boolean);
    const headlines = row.slots.headlines.map(slotText).filter(Boolean);

    const primary = primaryTexts.length > 0 ? primaryTexts[mix % primaryTexts.length] : '';
    const headline = isCarousel
        ? slotText(row.slots.headlines[assetIndex])
        : headlines.length > 0 ? headlines[mix % headlines.length] : '';
    const mixes = isCarousel ? 1 : Math.max(primaryTexts.length, headlines.length);

    const long = primary.length > SEE_MORE_AT;
    const shown = long && !expanded ? `${primary.slice(0, SEE_MORE_AT).trimEnd()}…` : primary;
    const domain = domainOf(row.slots.destinationUrl);
    const cta = CTA_OPTIONS.find(o => o.id === row.callToAction)?.label ?? 'Learn More';

    return (
        <div className="space-y-2">
            <div className="rounded-lg overflow-hidden bg-[#242526] text-[#E4E6EB] shadow-lg ring-1 ring-white/5">
                {/* Page and "Sponsored" */}
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                        P
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-[13px] font-semibold">Your Page</p>
                        <p className="flex items-center gap-1 text-[11px] text-[#B0B3B8]">
                            Sponsored · <Globe className="w-2.5 h-2.5" />
                        </p>
                    </div>
                    <MoreHorizontal className="w-5 h-5 text-[#B0B3B8]" />
                </div>

                {/* Primary text */}
                <div className="px-3 pb-2 text-[13px] leading-snug whitespace-pre-wrap">
                    {primary ? (
                        <>
                            {shown}
                            {long && (
                                <button onClick={() => setExpanded(!expanded)} className="ml-1 font-semibold text-[#B0B3B8] hover:underline">
                                    {expanded ? 'See less' : 'See more'}
                                </button>
                            )}
                        </>
                    ) : (
                        <span className="italic text-[#B0B3B8]">No primary text</span>
                    )}
                </div>

                {/* Media */}
                <div className="bg-black">{media}</div>

                {/* Link bar */}
                <div className="flex items-center gap-3 px-3 py-2.5 bg-[#3A3B3C]">
                    <div className="flex-1 min-w-0 leading-tight">
                        {domain && <p className="text-[11px] text-[#B0B3B8] truncate">{domain}</p>}
                        {headline ? (
                            <p className="text-[14px] font-semibold line-clamp-2">{headline}</p>
                        ) : (
                            <p className="text-[13px] italic text-[#B0B3B8]">{isCarousel ? `No headline for card ${assetIndex + 1}` : 'No headline'}</p>
                        )}
                    </div>
                    <span className="shrink-0 px-3 py-1.5 rounded-md bg-[#4E4F50] text-[13px] font-semibold">{cta}</span>
                </div>
            </div>

            {mixes > 1 && (
                <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-foreground-subtle">
                    <span>
                        Meta mixes {primaryTexts.length} primary text{primaryTexts.length === 1 ? '' : 's'} and {headlines.length} headline{headlines.length === 1 ? '' : 's'}.
                    </span>
                    <button
                        onClick={() => { setMix(m => m + 1); setExpanded(false); }}
                        className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
                    >
                        <Shuffle className="w-3 h-3" /> Next mix
                    </button>
                </div>
            )}
        </div>
    );
}
