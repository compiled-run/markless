// Server only: marks the parts of a page a navigation can keep (see PROTOCOL_KEEP_ATTRIBUTE). The router's page server
// installs it; the renderer calls it through KEEP_PARTS_HOOK.
import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '@markless/serializer/protocol';
import {
	PROTOCOL_ISLANDS_ATTRIBUTE,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_SHARED_PREFIX,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_STUB_ATTRIBUTE,
} from '../../../serializer/src/protocol-keep.ts';
import {
	KEEP_ATTRIBUTE,
	KEEP_CHILDREN,
	KEEP_END,
	KEEP_PARTS_HOOK,
	KEEP_SPAN,
	KEEP_TEXT,
	KEEP_VALUE,
	type KeepParts,
} from './keep-parts-hook.ts';

export {
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_ISLANDS_ATTRIBUTE,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_SHARED_PREFIX,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_STUB_ATTRIBUTE,
};

type Coordinates = {
	readonly locators: ReadonlyArray<unknown>;
	readonly anchors: ReadonlyArray<{ readonly kind: string }>;
};

type SsrDataChildView = {
	readonly locators?: ReadonlyArray<{ readonly hostNodeId?: unknown }>;
	readonly keyedRepeats?: ReadonlyArray<unknown>;
	readonly domUpdates?: ReadonlyArray<{
		readonly graphNodeId?: unknown;
		readonly path?: ReadonlyArray<string>;
	}>;
};

type SsrDataChildOutput = {
	readonly state?: {
		readonly cells?: ReadonlyArray<unknown>;
		readonly computed?: ReadonlyArray<unknown>;
	};
	readonly propEvents?: ReadonlyArray<unknown>;
	readonly structure?: { readonly keepMasked?: string; readonly keepModule?: string };
};
type SsrDataChildRecords = SsrDataChildView & {
	readonly events?: ReadonlyArray<{ readonly hostNodeId?: unknown }>;
	readonly behaviors?: ReadonlyArray<unknown>;
	readonly elementHandles?: ReadonlyArray<unknown>;
	readonly branches?: ReadonlyArray<unknown>;
	readonly asyncBoundaries?: ReadonlyArray<unknown>;
};

// Nothing the browser resumes but events: no state, behaviours, handles, branches or async content. An event's
// handler comes from the next page's payload, and its ref from the fragment (see the router's kept-stubs).
function noResumeRecords(child: SsrDataChildOutput, view: SsrDataChildRecords): boolean {
	return (
		!view.behaviors?.length &&
		!view.elementHandles?.length &&
		!view.branches?.length &&
		!view.asyncBoundaries?.length &&
		!child.state?.cells?.length &&
		!child.state?.computed?.length &&
		!child.propEvents?.length
	);
}

// The `{children}` slot is an update bound to the children prop: the page's own content, never a reason not to keep.
const childrenUpdates = (view: SsrDataChildView) =>
	(view.domUpdates ?? []).filter(
		(update) =>
			update.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}children` ||
			(update.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID &&
				update.path?.[0] === 'children'),
	).length;

const OPENING_TAG = /^\s*<([a-zA-Z][\w-]*)/;
// Below this much markup a kept part saves less than its own mark costs.
const KEEP_MIN_CHARS = 512;
// A part kept inside a kept part needs none of its own marks.
const NESTED_MARKS = new RegExp(
	` (?:${PROTOCOL_KEEP_ATTRIBUTE}|${PROTOCOL_ISLANDS_ATTRIBUTE})="[^"]*"| ${PROTOCOL_OWN_ATTRIBUTE}(?=[\\s/>])`,
	'g',
);
const RAW_TEXT = /^(?:script|style|textarea|title)$/i;
const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;
const SLOT_SPAN = new RegExp(
	`([${KEEP_VALUE}${KEEP_ATTRIBUTE}])([^${KEEP_SPAN}]*)${KEEP_SPAN}([^${KEEP_END}]*)${KEEP_END}`,
	'g',
);

export type KeepIsland = readonly [element: number, name: string, value: string | null];

type Masked = {
	readonly hash: string;
	readonly islands: ReadonlyArray<KeepIsland>;
	readonly text: boolean;
	// Element index of each `{children}` slot's element, in document order.
	readonly children: ReadonlyArray<number>;
	readonly elements: number;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const unescape = (text: string) =>
	text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITY[name]!);

// A whole-attribute slot renders nothing, ` name`, or ` name="value"`.
function attributeValue(rendered: string): string | null | undefined {
	if (!rendered) return null;
	const parsed = /^ [^\s="]+(?:="([^"]*)")?$/.exec(rendered);
	return parsed ? unescape(parsed[1] ?? '') : undefined;
}

// Elements in document order (the root is 0), with the attribute slots each holds; or undefined when the masked
// markup does not read as one element tree under one root.
function readMasked(masked: string): Masked | undefined {
	const islands: KeepIsland[] = [];
	const children: number[] = [];
	const open: number[] = [];
	let element = -1;
	let text = false;
	let spans = 0;
	for (let at = 0; at < masked.length; ) {
		const char = masked[at]!;
		if (char === KEEP_TEXT) text = true;
		else if (char === KEEP_CHILDREN) {
			if (masked[at - 1] !== '>' || !masked.startsWith('</', at + 1)) return undefined;
			children.push(open.at(-1)!);
		} else if (char === '<') {
			if (masked.startsWith('<!--', at)) {
				const close = masked.indexOf('-->', at + 4);
				if (close === -1) return undefined;
				at = close + 3;
				continue;
			}
			if (masked[at + 1] === '/') {
				open.pop();
				at = masked.indexOf('>', at) + 1 || masked.length;
				continue;
			}
			const name = /^<([a-zA-Z][\w:.-]*)/.exec(masked.slice(at, at + 64))?.[1];
			if (name) {
				// A second root: the browser keeps the first element only, and the islands would count past it.
				// A template's content is not its children in the DOM, so the browser could not count into it.
				if ((element >= 0 && open.length === 0) || name.toLowerCase() === 'template')
					return undefined;
				let end = at + name.length + 1;
				for (let quote = ''; end < masked.length; end++) {
					const inner = masked[end]!;
					if (quote) quote = inner === quote ? '' : quote;
					else if (inner === '"' || inner === "'") quote = inner;
					else if (inner === '>') break;
				}
				if (end >= masked.length) return undefined;
				element++;
				for (const span of masked.slice(at, end).matchAll(SLOT_SPAN)) {
					const value =
						span[1] === KEEP_VALUE ? unescape(span[3]!) : attributeValue(span[3]!);
					if (value === undefined) return undefined;
					islands.push([element, span[2]!, value]);
					spans++;
				}
				at = end + 1;
				if (RAW_TEXT.test(name)) {
					const close = masked.toLowerCase().indexOf(`</${name.toLowerCase()}`, at);
					if (close === -1) return undefined;
					at = close;
				} else if (!VOID.test(name) && masked[end - 1] !== '/') open.push(element);
				continue;
			}
		}
		at++;
	}
	let markers = 0;
	for (const char of masked) if (char === KEEP_VALUE || char === KEEP_ATTRIBUTE) markers++;
	if (markers !== spans) return undefined;
	return {
		hash: hashText(masked.replace(SLOT_SPAN, '$1$2')),
		islands,
		text,
		children,
		elements: element + 1,
	};
}

/**
 * A presentational child's root element gets a hash of its markup with the page's children and its attribute slot
 * values left out, and the element holding exactly those children is marked as the page's own: equal hashes are equal
 * bytes but for those values, so a navigation keeps the element, sets the values and replaces only the page's children.
 */
function keepMarked(
	html: string,
	projected: string | undefined,
	masked: string | undefined,
	presentational: boolean,
	shared: boolean,
): string {
	if (!presentational || !OPENING_TAG.test(html)) return html;
	let start = html.length;
	let end = html.length;
	if (projected) {
		// The page's children appear once, verbatim, as the whole content of one element; or this output is not kept.
		start = html.indexOf(projected);
		if (start === -1 || html.indexOf(projected, start + 1) !== -1) return html;
		end = start + projected.length;
		const tagStart = html.lastIndexOf('<', start - 1);
		const name = /^<([a-zA-Z][\w-]*)[^<>]*>$/.exec(html.slice(tagStart, start))?.[1];
		if (!name || !html.startsWith(`</${name}`, end)) return html;
	}
	const before = html.slice(0, projected ? start - 1 : html.length).replace(NESTED_MARKS, '');
	const after = html.slice(end).replace(NESTED_MARKS, '');
	if (before.length + after.length < KEEP_MIN_CHARS) return html;
	const read = masked === undefined ? undefined : readMasked(masked);
	// The masked markup holds exactly this part's own `{children}`, where the html has it.
	const valid =
		read &&
		(projected
			? read.children.length === 1 && read.children[0] === (readMasked(html.slice(0, start))?.elements ?? 0) - 1
			: read.children.length === 0);
	const hash = valid
		? (shared && !read.text ? PROTOCOL_KEEP_SHARED_PREFIX : '') + read.hash
		: hashText(before + '>' + after);
	const islands =
		valid && read.islands.length
			? ` ${PROTOCOL_ISLANDS_ATTRIBUTE}="${JSON.stringify(read.islands).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
			: '';
	const shell = projected ? `${before} ${PROTOCOL_OWN_ATTRIBUTE}>${projected}${after}` : before;
	const root = OPENING_TAG.exec(shell)!;
	const at = root.index + root[0].length;
	return `${shell.slice(0, at)} ${PROTOCOL_KEEP_ATTRIBUTE}="${hash}"${islands}${shell.slice(at)}`;
}

function hashText(text: string): string {
	let high = 0x811c9dc5;
	let low = 0x01000193;
	for (let at = 0; at < text.length; at++) {
		const code = text.charCodeAt(at);
		high = Math.imul(high ^ code, 0x01000193);
		low = Math.imul(low ^ code, 0x5bd1e995);
	}
	return (high >>> 0).toString(36) + (low >>> 0).toString(36);
}

// Events, DOM updates, branches and lists leave records and coordinates; a render path carries one or both, and every
// one present must be empty. A nested component's anchor is only structure.
function presentational(child: object): boolean {
	const view = (child as { readonly view?: SsrDataChildRecords }).view;
	const coordinates = (child as { readonly coordinates?: Coordinates }).coordinates;
	return (
		(!!view || !!coordinates) &&
		(!view ||
			((view.locators ?? []).filter(
				(locator) => !view.events?.some((event) => event.hostNodeId === locator.hostNodeId),
			).length <= childrenUpdates(view) &&
				(view.domUpdates?.length ?? 0) === childrenUpdates(view) &&
				(view.keyedRepeats?.length ?? 0) === 0 &&
				noResumeRecords(child as SsrDataChildOutput, view))) &&
		(!coordinates ||
			(coordinates.locators.length === 0 &&
				coordinates.anchors.every((anchor) => anchor.kind === 'child-component')))
	);
}

/**
 * Installs keep-parts for every render in this process. `sharedModules`: the component modules more than one route
 * renders, from the build's module graph; only their parts may be named in a fragment address.
 */
export function installKeepParts(sharedModules: ReadonlySet<string> = new Set()): void {
	(globalThis as { [KEEP_PARTS_HOOK]?: KeepParts })[KEEP_PARTS_HOOK] = (html, projected, child) => {
		const structure = (child as SsrDataChildOutput).structure;
		return keepMarked(
			html,
			projected,
			structure?.keepMasked,
			presentational(child),
			structure?.keepModule !== undefined && sharedModules.has(structure.keepModule),
		);
	};
}
