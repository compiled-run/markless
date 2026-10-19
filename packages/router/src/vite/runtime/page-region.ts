import {
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
} from '@markless/web/fns/container-region';
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
export const PAGE_START_MARKER = `<!--${PROTOCOL_CONTAINER_START_COMMENT}-->`;

const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

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

type Host = {
	readonly start: number;
	readonly open: string;
	readonly tag: string;
	/** The document's own markup before the slot inside the host, then the start marker; or ''. */
	readonly before: string;
};

/**
 * The document with the page in its children slot, split where streamed appends go:
 * `prefix + suffix` is the whole document. When the slot sits inside an element that can hold any
 * content, that element becomes the container: the page's markup lands as its children, a comment
 * closes the page's nodes and, when document content precedes the slot, another opens them, so
 * the document's content on either side stays where the author wrote it.
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
		prefix: `${shell.slice(0, host.start)}${host.open}${host.before}${page.region!.inner}`,
		suffix: `${PAGE_END_MARKER}${rest}`,
	};
}

// A client-navigation shell never varies by route, so its body is left out: the region document
// is the shell's head plus the container element with the page alone.
export function fragmentPage(shell: string, slot: string, page: PageHtml): string {
	const at = shell.indexOf(slot);
	const bodyAt = shell.search(/<body[\s>]/i);
	const bodyOpenEnd = bodyAt === -1 ? -1 : shell.indexOf('>', bodyAt);
	if (at === -1 || bodyOpenEnd === -1) {
		const placed = placePage(shell, slot, page);
		return placed.prefix + placed.suffix;
	}
	const host = regionHost(shell, at, page);
	const inner = (host?.before ? PAGE_START_MARKER : '') + (page.region?.inner ?? '');
	if (host?.tag === 'body')
		return `${shell.slice(0, host.start)}${host.open}${inner}</body></html>`;
	const region = host ? `${host.open}${inner}</${host.tag}>` : page.bodyHtml;
	return `${shell.slice(0, bodyOpenEnd + 1)}${region}</body></html>`;
}

function regionHost(shell: string, at: number, page: PageHtml): Host | undefined {
	if (!page.region) return undefined;
	const open = innermostOpenTag(shell, at);
	if (!open || !REGION_HOSTS.has(open.tag)) return undefined;
	const before = shell.slice(open.end + 1, at);
	return {
		start: open.start,
		open: `${shell.slice(open.start, open.end)}${page.region.attributes}>`,
		tag: open.tag,
		before: before.trim() ? before + PAGE_START_MARKER : '',
	};
}

// The element the parser has open at `at`: the document renders well-formed html that escapes `<`.
function innermostOpenTag(html: string, at: number) {
	const stack: Array<{ readonly tag: string; readonly start: number; readonly end: number }> = [];
	let cursor = 0;
	let lower: string | undefined;
	while (cursor < at) {
		const start = html.indexOf('<', cursor);
		if (start === -1 || start >= at) break;
		if (html.startsWith('<!--', start)) {
			const close = html.indexOf('-->', start + 4);
			cursor = close === -1 ? at : close + 3;
			continue;
		}
		const end = tagEnd(html, start);
		if (end === -1 || end >= at) break;
		cursor = end + 1;
		const name = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start, end + 1));
		if (!name) continue;
		const tag = name[2]!.toLowerCase();
		if (name[1]) {
			const match = stack.findLastIndex((entry) => entry.tag === tag);
			if (match !== -1) stack.length = match;
			continue;
		}
		if (VOID_TAGS.has(tag) || html[end - 1] === '/') continue;
		if (RAW_TEXT_TAGS.has(tag)) {
			const close = (lower ??= html.toLowerCase()).indexOf(`</${tag}`, cursor);
			cursor = close === -1 ? at : close;
			continue;
		}
		stack.push({ tag, start, end });
	}
	return stack.at(-1);
}

function tagEnd(html: string, from: number): number {
	let quote = '';
	for (let at = from; at < html.length; at++) {
		const char = html[at]!;
		if (quote) {
			if (char === quote) quote = '';
		} else if (char === '"' || char === "'") quote = char;
		else if (char === '>') return at;
	}
	return -1;
}
