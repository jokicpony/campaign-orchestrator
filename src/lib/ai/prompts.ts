import { BrainConfig, PromptModifier, Product, CustomerPersona, GlobalPromptSettings, BUILT_IN_MODIFIERS } from '@/types';

// Placeholder suggestions that cycle in the context textarea
export const PLACEHOLDER_SUGGESTIONS = [
    "Describe your product and who it's for...",
    "What feeling should customers have after seeing this ad?",
    "What makes this offer special or different?",
    "Tell me about your ideal customer's problem...",
    "Focus on the transformation your product creates...",
    "What would make someone stop scrolling for this?",
    "Describe the moment of using your product...",
    "What's the one thing customers always mention?",
    "Complete this: 'Finally, a product that...'",
    "What would your happiest customer say about this?",
];

// Build the system prompt from Global Settings
export function buildSystemPrompt(settings?: GlobalPromptSettings): string {
    // Fallback voice used only when no copywriter persona is configured
    const fallbackVoice = `You are an expert direct-response copywriter specializing in Meta (Facebook/Instagram) advertising.
Your copy is concise, compelling, and optimized for mobile scroll-stopping.`;

    // Operational rules for output formatting — always included
    const criticalRules = `CRITICAL RULES:
- Never include quotation marks around your output
- Each item MUST be a complete, self-contained piece of copy on a SINGLE LINE
- NEVER output an incomplete sentence or fragment — every line must be a finished thought
- Write for mobile-first consumption
- Focus on benefits over features
- Headlines must be SHORT and punchy (under 40 characters)
- Primary text should be scannable (125-250 characters)
- If you are nearing the output limit, STOP — do NOT start a new item you cannot finish`;

    // Use the user's copywriter persona as the primary voice, or fall back to generic
    const voice = (settings?.copywriterPersona)
        ? settings.copywriterPersona
        : fallbackVoice;

    let prompt = `${voice}\n\n${criticalRules}`;

    if (!settings) return prompt;

    // Add brand knowledge
    if (settings.brandKnowledge) {
        prompt += `\n\nBRAND KNOWLEDGE:\n${settings.brandKnowledge}`;
    }

    // Add kill list (words to avoid)
    if (settings.killList?.length > 0) {
        prompt += `\n\nNEVER USE THESE WORDS OR PHRASES:\n${settings.killList.map(w => `- ${w}`).join('\n')}`;
    }

    // Add emoji guidance
    const emojiGuidance = {
        none: 'Do NOT use any emoji in your output.',
        sparse: 'Use emoji very sparingly, at most 1 per piece of copy.',
        liberal: 'Feel free to use multiple emoji to add personality and visual breaks.',
    };
    if (settings.emojiDensity) {
        prompt += `\n\nEMOJI RULE:\n${emojiGuidance[settings.emojiDensity]}`;
    }

    return prompt;
}

// Build the user prompt with context, modifiers, and optional product/persona
export function buildUserPrompt(
    config: BrainConfig,
    type: 'headline' | 'primary_text' | 'both',
    count: number,
    allModifiers: PromptModifier[],
    product?: Product,
    persona?: CustomerPersona
): string {
    const { context, activeModifiers = [] } = config;

    // Get active modifier details
    const activeModifierDetails = activeModifiers
        .map(id => allModifiers.find(m => m.id === id))
        .filter(Boolean) as PromptModifier[];

    // Build product section if a product is selected
    let productSection = '';
    if (product) {
        productSection = `\n\nPRODUCT: ${product.emoji} ${product.name}`;
        if (product.usps) {
            productSection += `\n\nKEY SELLING POINTS:\n${product.usps}`;
        }
    }

    // Build persona section if a persona is selected
    let personaSection = '';
    if (persona) {
        personaSection = `\n\nTARGET AUDIENCE: ${persona.name}\n${persona.description}`;
    }

    // Build the type-specific instruction with STRONG emphasis
    let typeInstruction = '';
    let outputExample = '';

    if (type === 'headline') {
        typeInstruction = `Generate EXACTLY ${count} HEADLINE variations.
- Each headline must be under 40 characters
- ONLY output headlines, do NOT output any primary text
- Each headline should be unique and take a different angle`;
        outputExample = `[H] Your first headline here
---
[H] Your second headline here
---
[H] Your third headline here`;
    } else if (type === 'primary_text') {
        typeInstruction = `Generate EXACTLY ${count} PRIMARY TEXT variations.
- Each primary text should be 125-250 characters
- ONLY output primary text, do NOT output any headlines
- Each should be punchy, scannable, and take a different angle`;
        outputExample = `[P] Your first primary text here with detail and a compelling call to action
---
[P] Your second primary text here taking a different angle and emotional approach
---
[P] Third variation with unique hook and benefit-focused messaging`;
    } else {
        const headlineCount = Math.ceil(count / 2);
        const primaryCount = count - headlineCount;
        typeInstruction = `Generate EXACTLY ${headlineCount} HEADLINES and EXACTLY ${primaryCount} PRIMARY TEXTS.
- Headlines must be under 40 characters
- Primary texts should be 125-250 characters
- Each should take a unique angle`;
        outputExample = `[H] First headline
---
[H] Second headline
---
[H] Third headline
---
[P] First primary text with compelling benefit and call to action
---
[P] Second primary text with different emotional angle`;
    }

    // Build modifier instructions
    let modifierInstructions = '';
    if (activeModifierDetails.length > 0) {
        modifierInstructions = '\n\nAPPLY THESE CREATIVE DIRECTIONS:\n' +
            activeModifierDetails.map(m => `- ${m.emoji} ${m.label}: ${m.promptInjection}`).join('\n');
    }

    return `CONTEXT:
${context}${productSection}${personaSection}

TASK:
${typeInstruction}
${modifierInstructions}

OUTPUT FORMAT (follow this EXACTLY):
- Separate each piece of copy with --- on its own line
- Start each piece with [H] for headlines or [P] for primary text
- The copy may span multiple lines (e.g., for list-format or bullet points) — that is fine
- The --- separator marks where one item ends and the next begins
- No numbering, no quotation marks, no extra commentary, no explanations
- NEVER start a new item you cannot finish — every item must be complete
- Do NOT output partial prefixes like lone brackets at the end

EXAMPLE OUTPUT:
${outputExample}

NOW GENERATE YOUR ${count} VARIATIONS:`;
}

// Get all available modifiers (built-in + custom)
export function getAllModifiers(customModifiers: PromptModifier[] = []): PromptModifier[] {
    return [...BUILT_IN_MODIFIERS, ...customModifiers];
}

// Parse AI output into structured items.
// Uses --- separators as primary delimiters, with [H]/[P] prefix fallback.
// This supports multi-line items (e.g. list-format bullet points).
export function parseGeneratedOutput(output: string, killList: string[] = []): Array<{ text: string; type: 'headline' | 'primary_text' }> {
    const items: Array<{ text: string; type: 'headline' | 'primary_text' }> = [];

    // Strategy: split on --- separators first, then parse each block
    const blocks = output.split(/\n---\n|\n---$|^---\n/).filter(b => b.trim());

    if (blocks.length > 1) {
        // --- separator mode: each block is one item
        for (const block of blocks) {
            const item = parseBlock(block.trim());
            if (item) items.push(item);
        }
    } else {
        // Fallback: no separators found — use line-by-line [H]/[P] parsing
        const lines = output.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '---') continue;

            if (/^\[H\]/i.test(trimmed)) {
                const text = trimmed.replace(/^\[H\]/i, '').trim();
                if (text.length > 0) items.push({ text, type: 'headline' });
            } else if (/^\[P\]/i.test(trimmed)) {
                const text = trimmed.replace(/^\[P\]/i, '').trim();
                if (text.length > 0) items.push({ text, type: 'primary_text' });
            } else if (items.length > 0) {
                // Continuation line
                items[items.length - 1].text += '\n' + trimmed;
            }
        }
    }

    // Post-parse cleanup
    const cleaned = items
        .map(item => ({
            ...item,
            // Strip trailing partial tags/brackets (e.g., " [" or " [H" or " [P")
            text: item.text.replace(/\s*\[(?:[HhPp]?\]?)?\s*$/, '').trim(),
        }))
        .filter(item => {
            if (item.text.length === 0) return false;
            if (item.type === 'headline' && item.text.length < 5) return false;
            if (item.type === 'primary_text' && item.text.length < 20) return false;
            return true;
        });

    // De-duplicate — models occasionally emit the same line twice. Collapse by
    // normalized text within each type, keeping the first occurrence.
    const seen = new Set<string>();
    const deduped = cleaned.filter(item => {
        const key = `${item.type}::${item.text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?,]+$/, '').trim()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Enforce the kill list — the prompt already tells the model to avoid these
    // words, but enforce it on the output too. Match whole words/phrases,
    // case-insensitive, so a banned "cheap" drops "…so cheap" but not "cheapest".
    const banned = killList
        .map(w => w.trim())
        .filter(Boolean)
        .map(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
    if (banned.length === 0) return deduped;
    const allowed = deduped.filter(item => !banned.some(re => re.test(item.text)));
    // Safety net: never return an empty set purely because of the kill list — if
    // every option tripped it, surface the de-duped set rather than nothing.
    return allowed.length > 0 ? allowed : deduped;
}

// Parse a single block (from --- separated output) into an item
function parseBlock(block: string): { text: string; type: 'headline' | 'primary_text' } | null {
    const lines = block.split('\n');
    const firstLine = lines[0].trim();

    let type: 'headline' | 'primary_text';
    let firstLineText: string;

    if (/^\[H\]/i.test(firstLine)) {
        type = 'headline';
        firstLineText = firstLine.replace(/^\[H\]/i, '').trim();
    } else if (/^\[P\]/i.test(firstLine)) {
        type = 'primary_text';
        firstLineText = firstLine.replace(/^\[P\]/i, '').trim();
    } else {
        return null; // Block doesn't start with a valid prefix
    }

    // Combine first line with remaining lines (for multi-line items like lists)
    const remainingLines = lines.slice(1).filter(l => l.trim());
    const fullText = remainingLines.length > 0
        ? firstLineText + '\n' + remainingLines.map(l => l.trim()).join('\n')
        : firstLineText;

    if (fullText.length === 0) return null;
    return { text: fullText, type };
}

// Build an iteration prompt - generate variations of a specific piece of copy
export function buildIterationPrompt(
    baseCopy: { text: string; type: 'headline' | 'primary_text' },
    modifier: PromptModifier,
    count: number = 3
): string {
    const typeLabel = baseCopy.type === 'headline' ? 'headline' : 'primary text';
    const typePrefix = baseCopy.type === 'headline' ? '[H]' : '[P]';
    const charLimit = baseCopy.type === 'headline' ? 'under 40 characters' : '125-250 characters';

    return `We have this ${typeLabel} that's working well:

"${baseCopy.text}"

TASK:
Generate EXACTLY ${count} new variations of this ${typeLabel}, but apply this creative direction:
${modifier.emoji} ${modifier.label}: ${modifier.promptInjection}

RULES:
- Keep the core message/benefit, but apply the modifier's style
- Each variation should be ${charLimit}
- Each variation should be distinct from the others
- Maintain the original intent but add the ${modifier.label.toLowerCase()} angle

OUTPUT FORMAT (follow EXACTLY, separate items with ---):
${typePrefix} First variation here
---
${typePrefix} Second variation here
---
${typePrefix} Third variation here

NOW GENERATE ${count} VARIATIONS:`;
}

// Build a custom iteration prompt with freeform user direction
export function buildCustomIterationPrompt(
    baseCopy: { text: string; type: 'headline' | 'primary_text' },
    customDirection: string,
    count: number = 3
): string {
    const typeLabel = baseCopy.type === 'headline' ? 'headline' : 'primary text';
    const typePrefix = baseCopy.type === 'headline' ? '[H]' : '[P]';
    const charLimit = baseCopy.type === 'headline' ? 'under 40 characters' : '125-250 characters';

    return `We have this ${typeLabel} that's working well:

"${baseCopy.text}"

TASK:
Generate EXACTLY ${count} new variations of this ${typeLabel}, following this specific direction:
"${customDirection}"

RULES:
- Apply the user's direction while keeping the core message/benefit
- Each variation should be ${charLimit}
- Each variation should be distinct from the others
- Be creative in interpreting the direction

OUTPUT FORMAT (follow EXACTLY, separate items with ---):
${typePrefix} First variation here
---
${typePrefix} Second variation here
---
${typePrefix} Third variation here

NOW GENERATE ${count} VARIATIONS:`;
}

// Build a remix prompt that uses multiple items as vibe-setters
export function buildRemixPrompt(
    items: Array<{ text: string; type: 'headline' | 'primary_text' }>,
    count: number = 5
): string {
    const headlineItems = items.filter(i => i.type === 'headline');
    const primaryItems = items.filter(i => i.type === 'primary_text');

    // Determine output type distribution proportionally
    let headlineCount = 0;
    let primaryCount = 0;
    if (headlineItems.length > 0 && primaryItems.length > 0) {
        const ratio = headlineItems.length / items.length;
        headlineCount = Math.max(1, Math.round(count * ratio));
        primaryCount = count - headlineCount;
    } else if (headlineItems.length > 0) {
        headlineCount = count;
    } else {
        primaryCount = count;
    }

    const inspirationBlock = items
        .map(i => `- [${i.type === 'headline' ? 'Headline' : 'Primary Text'}] "${i.text}"`)
        .join('\n');

    const outputLines: string[] = [];
    for (let i = 0; i < headlineCount; i++) outputLines.push('[H] <new headline variation>');
    for (let i = 0; i < primaryCount; i++) outputLines.push('[P] <new primary text variation>');

    return `Here are ad copies that our editor liked — they represent the creative direction and vibe we're going for:

${inspirationBlock}

TASK:
Using these as creative inspiration (tone, energy, angle, structure), generate EXACTLY ${count} brand-new variations.
Do NOT repeat or lightly rephrase the originals — create genuinely fresh takes that channel the same vibe.
Think of these as a mood board, not a template.

RULES:
- Each variation must feel like it came from a different creative brief
- Headlines must be under 40 characters
- Primary text must be 125-250 characters
- Surprise us with new angles, metaphors, or hooks
- Maintain the brand voice and core benefit
${headlineCount > 0 && primaryCount > 0 ? `- Generate ${headlineCount} headlines and ${primaryCount} primary texts` : ''}

OUTPUT FORMAT (follow EXACTLY, separate items with ---):
${outputLines.join('\n---\n')}

NOW GENERATE ${count} FRESH VARIATIONS:`;
}

