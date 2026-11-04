/**
 * Types for the campaign copywriter (the Copywriter tab in the Palette).
 * Kept free of runtime imports so the offline tests can load them.
 */

/** A page the server read for context. Stored on the campaign so rows share it. */
export interface CopyContextPage {
    url: string;
    title: string;
    text: string;          // Fact sheet (or trimmed visible text), ≤ PAGE_TEXT_LIMIT chars
    fetchedAt: string;     // ISO date
    summarized?: boolean;  // text is a context sheet the page model wrote from the page
    error?: string;        // Set when the page couldn't be read; text is ''
}

/** Copy with real spend behind it (from the Palette's Top Performers). */
export interface CopyWinner {
    type: 'headline' | 'primary_text';
    text: string;
    spend?: number;
    ctr?: number;
}

/** Campaign-wide context: the cached prefix every row's request shares. */
export interface CopyCampaignContext {
    notes: string;
    pages: CopyContextPage[];
    topCopy: CopyWinner[];
}

/** What the copywriter knows about the row it's writing for. */
export interface CopyRowContext {
    label: string;                         // "01 · Holiday Sale"
    adType?: string;
    cardCount?: number;                    // Carousel cards (assets)
    callToAction?: string;
    destinationUrl?: string | null;
    winners: CopyWinner[];
    existing: { type: 'headline' | 'primary_text'; text: string }[];
    destinationPage?: { title: string; text: string };
}

/** One exchange in the campaign's copywriter conversation. */
export interface CopyTurn {
    role: 'user' | 'assistant';
    content: string;
}
