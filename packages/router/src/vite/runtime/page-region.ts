import { PROTOCOL_CONTAINER_END_COMMENT } from '@markless/web/fns/container-region';
import { splitSsrContainer } from '@markless/web/render-to-string';

// Elements whose content may be any flow content, so the page's own top-level markup can be
// their children exactly as the parser builds them. Anything else keeps the wrapper element.
const REGION_HOSTS = new Set([
	'article',
	'aside',
	'blockquote',
	'body',
	'dd',
	'details',
	'dialog',
	'div',
	'fieldset',
	'figure',
	'footer',
	'form',
	'header',
	'li',
	'main',
	'nav',
	'section',
	'td',
	'th',
]);

export const PAGE_END_MARKER = `<!--${PROTOCOL_CONTAINER_END_COMMENT}-->`;

export interface PageHtml {
	readonly headHtml: string;
	/** The container element the render produced, as html. */
	readonly bodyHtml: string;
	readonly region?: { readonly attributes: string; readonly inner: string };
}

export function splitPageHtml(html: string): PageHtml {
	const parts = splitSsrContainer(html);
	if (!parts) return { headHtml: '', bodyHtml: html };
	return {
		headHtml: parts.before,
		bodyHtml: html.slice(parts.before.length),
		region: { attributes: parts.attributes, inner: parts.inner },
	};
}

type Host = { readonly start: number; readonly open: string; readonly tag: string };

/**
 * The document with the page in its children slot, split where streamed appends go:
 * `prefix + suffix` is the whole document. When the slot is the first thing inside an element
 * that can hold any content, that element becomes the container: the page's markup lands as its
 * children and a comment closes the page's nodes, so document content after the slot stays where
 * the author wrote it. Content before the slot in the same element would shift every page element
 * the browser locates by its position, so then the page keeps its own wrapper element.
 */
export function placePage(
	shell: string,
	slot: string,
	page: PageHtml,
): { readonly prefix: string; readonly suffix: string } {
	const at = shell.indexOf(slot);
	if (at === -1) return { prefix: shell, suffix: '' };
	const rest = shell.slice(at + slot.length);
	const host = regionHost(shell, at, page);
	if (!host) return { prefix: shell.slice(0, at) + page.bodyHtml, suffix: rest };
	return {
		prefix: `${shell.slice(0, host.start)}${host.open}${page.region!.inner}`,
		suffix: `${PAGE_END_MARKER}${rest}`,
	};
}

// A client-navigation shell never varies by route, so its body is left out: the region document
// is the shell's head plus the container element alone.
export function fragmentPage(shell: string, slot: string, page: PageHtml): string {
	const at = shell.indexOf(slot);
	const bodyAt = shell.search(/<body[\s>]/i);
	const bodyOpenEnd = bodyAt === -1 ? -1 : shell.indexOf('>', bodyAt);
	if (at === -1 || bodyOpenEnd === -1) {
		const placed = placePage(shell, slot, page);
		return placed.prefix + placed.suffix;
	}
	const host = regionHost(shell, at, page);
	const inner = page.region?.inner ?? '';
	if (host?.tag === 'body')
		return `${shell.slice(0, host.start)}${host.open}${inner}</body></html>`;
	const region = host ? `${host.open}${inner}</${host.tag}>` : page.bodyHtml;
	return `${shell.slice(0, bodyOpenEnd + 1)}${region}</body></html>`;
}

function regionHost(shell: string, at: number, page: PageHtml): Host | undefined {
	if (!page.region) return undefined;
	let end = at;
	while (end > 0 && /\s/.test(shell[end - 1]!)) end--;
	if (shell[end - 1] !== '>' || shell[end - 2] === '/') return undefined;
	// Attribute values the document renders escape `<`, so the last one opens the tag.
	const start = shell.lastIndexOf('<', end - 1);
	const tag = /^<([a-zA-Z][a-zA-Z0-9]*)(?=[\s>])/
		.exec(shell.slice(start, end))?.[1]
		?.toLowerCase();
	if (!tag || !REGION_HOSTS.has(tag)) return undefined;
	return { start, open: `${shell.slice(start, end - 1)}${page.region.attributes}>`, tag };
}
