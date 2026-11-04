import { FileText, Type, type LucideIcon } from 'lucide-react';
import type { CopyItem } from '@/types';

type CopyType = CopyItem['type'];

interface CopyTypeStyle {
    label: string;
    plural: string;
    short: string;
    icon: LucideIcon;
    /** Text in the type's color: column labels, group titles. */
    text: string;
    /** A small filled tag: H / PT badges. */
    badge: string;
    /** A card's outline, with a stronger hover. */
    border: string;
    /** An outline for a box being typed in. */
    strong: string;
    /** A thin bar on the left of filled row slots. */
    bar: string;
    /** The type's button when it is picked. */
    picked: string;
    focus: string;
}

/**
 * One color per copy type, the same everywhere copy shows (rows, Top Performers,
 * the copywriter, Write your own, Active): headlines blue, primary text orange.
 * Full class names, so Tailwind finds them.
 */
export const COPY_TYPE: Record<CopyType, CopyTypeStyle> = {
    headline: {
        label: 'Headline',
        plural: 'Headlines',
        short: 'H',
        icon: Type,
        text: 'text-sky-300',
        badge: 'bg-sky-500/15 text-sky-300',
        border: 'border-sky-500/30 hover:border-sky-400/70',
        strong: 'border-sky-400/70',
        bar: 'bg-sky-400/70',
        picked: 'bg-sky-500/20 text-sky-200 shadow-sm',
        focus: 'focus:border-sky-400',
    },
    primary_text: {
        label: 'Primary text',
        plural: 'Primary text',
        short: 'PT',
        icon: FileText,
        text: 'text-orange-300',
        badge: 'bg-orange-500/15 text-orange-300',
        border: 'border-orange-500/30 hover:border-orange-400/70',
        strong: 'border-orange-400/70',
        bar: 'bg-orange-400/70',
        picked: 'bg-orange-500/20 text-orange-200 shadow-sm',
        focus: 'focus:border-orange-400',
    },
};
