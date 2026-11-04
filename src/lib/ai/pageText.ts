/**
 * Turn a fetched HTML page into compact text for the copywriter: title, meta
 * description, product data from JSON-LD (Shopify and most stores emit it),
 * then the visible body text. No runtime imports — tested offline.
 */

const ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', trade: '™', reg: '®', copy: '©', times: '×',
};

export function decodeEntities(s: string): string {
    return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return ENTITIES[code.toLowerCase()] ?? m;
    });
}

function clean(s: string): string {
    return decodeEntities(s).replace(/[ \t\f\v\r]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function metaContent(html: string, name: string): string {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    return content ? clean(content) : '';
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function offerPrice(offers: JsonValue | undefined): { price: number; currency: string } | null {
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return null;
    const price = Number(offer.price ?? offer.lowPrice);
    if (!Number.isFinite(price)) return null;
    return { price, currency: typeof offer.priceCurrency === 'string' ? offer.priceCurrency : '' };
}

/**
 * Product facts from JSON-LD: name, description, price, options, rating.
 * Shopify emits a ProductGroup whose variants carry the offers.
 */
function productFacts(html: string): string[] {
    const facts: string[] = [];
    const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
    const visit = (node: JsonValue) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        const types = ([] as JsonValue[]).concat(node['@type'] ?? []);
        if (types.includes('Product') || types.includes('ProductGroup')) {
            const name = typeof node.name === 'string' ? clean(node.name) : '';
            if (name) facts.push(`Product: ${name}`);
            if (typeof node.description === 'string') facts.push(`Description: ${clean(node.description.replace(/<[^>]+>/g, ' '))}`);
            const variants = (Array.isArray(node.hasVariant) ? node.hasVariant : []).filter(
                (v): v is { [k: string]: JsonValue } => !!v && typeof v === 'object' && !Array.isArray(v));
            const prices = [offerPrice(node.offers), ...variants.map(v => offerPrice(v.offers))]
                .filter((p): p is { price: number; currency: string } => !!p);
            if (prices.length > 0) {
                const low = Math.min(...prices.map(p => p.price));
                const high = Math.max(...prices.map(p => p.price));
                const money = (n: number) => n.toFixed(2);
                facts.push(`Price: ${low === high ? money(low) : `${money(low)}–${money(high)}`} ${prices[0].currency}`.trim());
            }
            // Variant names usually repeat the product name: "Case - Tote" → "Tote".
            const options = variants
                .map(v => (typeof v.name === 'string' ? clean(v.name) : ''))
                .map(v => (name && v.startsWith(name) ? v.slice(name.length).replace(/^[\s\-–—/|:]+/, '') : v))
                .filter(Boolean);
            if (options.length > 1) facts.push(`Options: ${[...new Set(options)].join(', ')}`);
            const rating = node.aggregateRating;
            if (rating && typeof rating === 'object' && !Array.isArray(rating) && rating.ratingValue !== undefined) {
                facts.push(`Rating: ${rating.ratingValue}${rating.reviewCount !== undefined ? ` from ${rating.reviewCount} reviews` : ''}`);
            }
        }
        if (node['@graph']) visit(node['@graph']);
    };
    for (const script of scripts) {
        const body = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
        try { visit(JSON.parse(body) as JsonValue); } catch { /* malformed JSON-LD is common */ }
    }
    return [...new Set(facts)];
}

// Store chrome that survives tag stripping: menus, carts, carousels, buttons.
const UI_LINE = /^(skip to (main )?content|menu|search|close|clear|zoom|previous|next|login|log in|sign in|account|cart|\d+ items?|your cart is empty|continue shopping|add to cart.*|buy it now|quantity:?|share|×|go to (item|slide) \d+|slide \d+( of \d+)?|(read|view|show|learn) more|click hotspots.*|@[\w.]+)$/i;

export function htmlToPageText(html: string, limit: number): { title: string; text: string } {
    const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '') || metaContent(html, 'og:title');
    const description = metaContent(html, 'description') || metaContent(html, 'og:description');
    const facts = productFacts(html);
    const factText = facts.join('\n');

    // Prefer <main>: it leaves out the store's header, menus and cart drawer.
    const main = html.match(/<main(?=[\s>])[^>]*>([\s\S]*)<\/main>/i)?.[1];
    const body = (main ?? html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
        .replace(/<(script|style|noscript|svg|template|iframe|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(nav|footer|header|aside|dialog|cart-drawer)(?=[\s>])[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<form[^>]+action=["'][^"']*\/(cart|search|localization|contact|account)[^>]*>[\s\S]*?<\/form>/gi, ' ')
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');
    const visible = clean(body)
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 1 && !UI_LINE.test(l))
        .filter((l, i, all) => all.indexOf(l) === i) // menus and badges repeat
        .filter(l => !(l.length > 40 && factText.includes(l))) // already in the JSON-LD description
        .join('\n');

    const text = [description && `Summary: ${description}`, ...facts, visible].filter(Boolean).join('\n');
    // Cut at a line break so the last line isn't half a sentence.
    if (text.length <= limit) return { title, text };
    const cut = text.lastIndexOf('\n', limit);
    return { title, text: text.slice(0, cut > limit / 2 ? cut : limit) };
}
