import {
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_ISLANDS_ATTRIBUTE,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_STUB_ATTRIBUTE,
	PROTOCOL_KEEP_SHARED_PREFIX,
} from '@markless/web/fns/keep-parts';

const RAW_TEXT = /^(?:script|style|textarea|title)$/i;
const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const SHARED_SET = new RegExp(`^(?:${PROTOCOL_KEEP_SHARED_PREFIX}[0-9a-z]+)+$`);
const KEPT_MARK = ` ${PROTOCOL_KEEP_ATTRIBUTE}="`;
const OWN_MARK = new RegExp(` ${PROTOCOL_OWN_ATTRIBUTE}(?=[\\s/>])`);

/** The shared keep hashes a fragment address names (its first segment), or undefined for a plain address. */
export function keptSetOf(segment: string): ReadonlySet<string> | undefined {
	if (!SHARED_SET.test(segment)) return undefined;
	return new Set(
		segment
			.split(PROTOCOL_KEEP_SHARED_PREFIX)
			.slice(1)
			.map((hash) => PROTOCOL_KEEP_SHARED_PREFIX + hash),
	);
}

type Tag = { readonly name: string; readonly end: number; readonly closed: boolean };

function tagAt(html: string, at: number): Tag | undefined {
	const name = /^<([a-zA-Z][\w:.-]*)/.exec(html.slice(at, at + 64))?.[1];
	if (!name) return undefined;
	let end = at + name.length + 1;
	for (let quote = ''; end < html.length; end++) {
		const char = html[end]!;
		if (quote) quote = char === quote ? '' : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === '>') break;
	}
	if (end >= html.length) return undefined;
	return { name, end, closed: VOID.test(name) || html[end - 1] === '/' };
}

// Where the element starting at `start` ends, past its closing tag; the markup is the renderer's, so well formed.
function elementEnd(html: string, start: number, tag: Tag): number {
	if (tag.closed) return tag.end + 1;
	const lower = RAW_TEXT.test(tag.name) ? html.toLowerCase() : '';
	if (lower) {
		const close = lower.indexOf(`</${tag.name.toLowerCase()}`, tag.end);
		return close === -1 ? -1 : html.indexOf('>', close) + 1;
	}
	let depth = 1;
	for (let at = tag.end + 1; at < html.length; ) {
		const open = html.indexOf('<', at);
		if (open === -1) return -1;
		if (html.startsWith('<!--', open)) {
			const close = html.indexOf('-->', open + 4);
			if (close === -1) return -1;
			at = close + 3;
		} else if (html[open + 1] === '/') {
			at = html.indexOf('>', open) + 1;
			if (at === 0) return -1;
			if (--depth === 0) return at;
		} else {
			const inner = tagAt(html, open);
			if (!inner) {
				at = open + 1;
				continue;
			}
			if (RAW_TEXT.test(inner.name)) {
				at = elementEnd(html, open, inner);
				if (at === -1) return -1;
			} else {
				at = inner.end + 1;
				if (!inner.closed) depth++;
			}
		}
	}
	return -1;
}

// Each element of a kept part in document order from its root, its own elements' children not counted.
function partElements(
	html: string,
	start: number,
	end: number,
	each: (element: number, open: number, tag: Tag, own: boolean) => void,
): void {
	let element = 0;
	for (let at = start; at < end; ) {
		const open = html.indexOf('<', at);
		if (open === -1 || open >= end) return;
		if (html.startsWith('<!--', open)) {
			const close = html.indexOf('-->', open + 4);
			at = close === -1 ? end : close + 3;
			continue;
		}
		const tag = html[open + 1] === '/' ? undefined : tagAt(html, open);
		if (!tag) {
			at = open + 1;
			continue;
		}
		const own = OWN_MARK.test(html.slice(open, tag.end + 1));
		each(element++, open, tag, own && open !== start);
		if (own && open === start) return;
		at = own || RAW_TEXT.test(tag.name) ? elementEnd(html, open, tag) : tag.end + 1;
		if (at <= 0) return;
	}
}

const EVENT_HOST = new RegExp(` ${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`);
const ISLANDS = new RegExp(` ${PROTOCOL_ISLANDS_ATTRIBUTE}="([^"]*)"`);
const unquote = (value: string) => value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const quote = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Every kept part in a fragment: its event refs join its islands (they number the page's events, so they differ from
 * page to page), and a part whose shared hash the requesting page holds comes as a stub: its root's start tag and its
 * own elements with the page's children. The browser keeps its copy of the rest.
 */
export function keptPartsForFragment(html: string, shared: ReadonlySet<string> | undefined): string {
	let out = '';
	let from = 0;
	for (let mark = html.indexOf(KEPT_MARK); mark !== -1; mark = html.indexOf(KEPT_MARK, from)) {
		const valueAt = mark + KEPT_MARK.length;
		const hash = html.slice(valueAt, html.indexOf('"', valueAt));
		const start = html.lastIndexOf('<', mark);
		const tag = tagAt(html, start);
		const end = tag ? elementEnd(html, start, tag) : -1;
		if (!tag || end === -1 || start < from) return out + html.slice(from);
		const events: Array<readonly [number, string, string]> = [];
		const owns: Array<readonly [number, number]> = [];
		partElements(html, start, end, (element, open, inner, own) => {
			const refs = EVENT_HOST.exec(html.slice(open, inner.end))?.[1];
			if (refs !== undefined) events.push([element, PROTOCOL_EVENT_HOST_ATTRIBUTE, unquote(refs)]);
			if (own) owns.push([open, elementEnd(html, open, inner)]);
		});
		let root = html.slice(start, tag.end + 1);
		if (events.length) {
			const listed = ISLANDS.exec(root);
			const islands = [...(listed ? JSON.parse(unquote(listed[1]!)) : []), ...events];
			const attribute = ` ${PROTOCOL_ISLANDS_ATTRIBUTE}="${quote(JSON.stringify(islands))}"`;
			root = listed ? root.replace(ISLANDS, () => attribute) : root.replace(/\/?>$/, (close) => attribute + close);
		}
		out += html.slice(from, start);
		if (hash.startsWith(PROTOCOL_KEEP_SHARED_PREFIX) && shared?.has(hash) && !OWN_MARK.test(root)) {
			out += root.replace(/^<[^\s/>]+/, (name) => `${name} ${PROTOCOL_STUB_ATTRIBUTE}`);
			for (const [open, close] of owns) out += keptPartsForFragment(html.slice(open, close), shared);
			out += `</${tag.name}>`;
		} else {
			out += root;
			let at = tag.end + 1;
			for (const [open, close] of owns) {
				out += html.slice(at, open) + keptPartsForFragment(html.slice(open, close), shared);
				at = close;
			}
			out += html.slice(at, end);
		}
		from = end;
	}
	return out + html.slice(from);
}
