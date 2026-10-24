// A layout template is the text a group of pages' fragments share, as segments; a page's own text fills the gaps.
export interface LayoutTemplate {
	readonly hash: string;
	readonly segments: readonly string[];
}

/** Where a build writes each template as an immutable client file, `<dir>/<hash>.txt`. */
export const LAYOUT_TEMPLATE_DIR = '_markless/layouts';

export function layoutTemplateHash(segments: readonly string[]): string {
	let high = 0x811c9dc5;
	let low = 0x01000193;
	for (const segment of segments) {
		for (let at = 0; at < segment.length; at++) {
			const code = segment.charCodeAt(at);
			high = Math.imul(high ^ code, 0x01000193);
			low = Math.imul(low ^ code, 0x5bd1e995);
		}
		high = Math.imul(high ^ 0xff, 0x01000193);
	}
	return (high >>> 0).toString(36) + (low >>> 0).toString(36);
}

/** A template file: each segment as its length, a colon, then its text. */
export function encodeLayoutTemplate(template: LayoutTemplate): string {
	return template.segments.map((segment) => `${segment.length}:${segment}`).join('');
}

/**
 * The page's own text around the template's segments, or undefined when the page does not hold every
 * segment in order. Leftmost matching finds a split whenever one exists, and the fills always total the same.
 */
export function splitByLayout(text: string, template: LayoutTemplate): string[] | undefined {
	const fills: string[] = [];
	let at = 0;
	for (const segment of template.segments) {
		const found = text.indexOf(segment, at);
		if (found === -1) return undefined;
		fills.push(text.slice(at, found));
		at = found + segment.length;
	}
	fills.push(text.slice(at));
	return fills;
}

/**
 * The content body for a region document: a comment naming the template and the document's length,
 * then each fill as its length, a colon and its text. Undefined when no template holds the document,
 * or when its text could not cross the wire unchanged.
 */
export function layoutContent(
	text: string,
	templates: readonly LayoutTemplate[],
): string | undefined {
	if (!templates.length || LONE_SURROGATE.test(text)) return undefined;
	let best: { readonly template: LayoutTemplate; readonly fills: string[] } | undefined;
	let bestOwn = text.length;
	for (const template of templates) {
		const fills = splitByLayout(text, template);
		if (!fills) continue;
		const own = fills.reduce((total, fill) => total + fill.length, 0);
		if (own < bestOwn) {
			best = { template, fills };
			bestOwn = own;
		}
	}
	if (!best) return undefined;
	return `${LAYOUT_CONTENT_OPEN}${best.template.hash}:${text.length}-->${best.fills
		.map((fill) => `${fill.length}:${fill}`)
		.join('')}`;
}

export const LAYOUT_CONTENT_OPEN = '<!--markless:layout:';

// UTF-8 replaces a lone surrogate, so the lengths the browser decodes would no longer add up.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
