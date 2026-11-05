// Server only: marks the parts of a page a navigation can keep (see PROTOCOL_KEEP_ATTRIBUTE). The router's page server
// installs it; the renderer calls it through KEEP_PARTS_HOOK.
import {
	PROTOCOL_PROP_GRAPH_NODE_PREFIX,
	PROTOCOL_PROPS_GRAPH_NODE_ID,
} from '@markless/serializer';
import { PROTOCOL_EVENT_HOST_ATTRIBUTE } from '../../../serializer/src/protocol-event-host.ts';
import {
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_INSTANCE_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_VARY_ATTRIBUTE,
	PROTOCOL_VARY_TEXT,
} from '../../../serializer/src/protocol-keep.ts';
import { KEEP_PARTS_HOOK, type KeepParts } from './keep-parts-hook.ts';

export {
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_KEEP_INSTANCE_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
	PROTOCOL_VARY_ATTRIBUTE,
	PROTOCOL_VARY_TEXT,
};

type Coordinates = {
	readonly locators: ReadonlyArray<unknown>;
	readonly anchors: ReadonlyArray<{ readonly kind: string }>;
};

type DomUpdate = {
	readonly hostNodeId?: unknown;
	readonly graphNodeId?: unknown;
	readonly path?: ReadonlyArray<string>;
	readonly target?: { readonly kind?: unknown; readonly name?: unknown };
};

type Locator = {
	readonly hostNodeId?: unknown;
	readonly strategy?: unknown;
	readonly index?: unknown;
};

type SsrDataChildView = {
	readonly locators?: ReadonlyArray<Locator>;
	readonly keyedRepeats?: ReadonlyArray<{ readonly collectionGraphNodeId?: unknown }>;
	readonly domUpdates?: ReadonlyArray<DomUpdate>;
};

type Computed = {
	readonly graphNodeId?: unknown;
	readonly async?: unknown;
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId?: unknown }>;
};

type SsrDataChildOutput = {
	readonly state?: {
		readonly cells?: ReadonlyArray<{ readonly graphNodeId?: unknown }>;
		readonly computed?: ReadonlyArray<Computed>;
	};
	readonly propEvents?: ReadonlyArray<unknown>;
};
type SsrDataChildRecords = SsrDataChildView & {
	readonly events?: ReadonlyArray<{ readonly hostNodeId?: unknown }>;
	readonly behaviors?: ReadonlyArray<unknown>;
	readonly elementHandles?: ReadonlyArray<unknown>;
	readonly branches?: ReadonlyArray<unknown>;
	readonly asyncBoundaries?: ReadonlyArray<unknown>;
};

const isProp = (id: unknown) =>
	typeof id === 'string' &&
	(id === PROTOCOL_PROPS_GRAPH_NODE_ID || id.startsWith(PROTOCOL_PROP_GRAPH_NODE_PREFIX));

function propValues(child: SsrDataChildOutput): Set<unknown> | undefined {
	if (!(child.state?.cells ?? []).every((cell) => isProp(cell.graphNodeId))) return undefined;
	const values = new Set<unknown>();
	for (const computed of child.state?.computed ?? []) {
		if (computed.async || !(computed.dependencies ?? []).every((d) => isProp(d.graphNodeId)))
			return undefined;
		values.add(computed.graphNodeId);
	}
	return values;
}

// Nothing the browser resumes but values from props: no own state, events, behaviours, handles, branches or async content.
function noResumeRecords(child: SsrDataChildOutput, view: SsrDataChildRecords): boolean {
	return (
		!view.events?.length &&
		!view.behaviors?.length &&
		!view.elementHandles?.length &&
		!view.branches?.length &&
		!view.asyncBoundaries?.length &&
		!!propValues(child) &&
		!child.propEvents?.length
	);
}

// The `{children}` slot is an update bound to the children prop: the page's own content, never a reason not to keep.
const isChildrenUpdate = (update: DomUpdate) =>
	update.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}children` ||
	(update.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && update.path?.[0] === 'children');

type VaryingSite = { readonly index: number; readonly name: string };

type KeptPart = {
	readonly sites: readonly VaryingSite[];
	// A part with state of its own: the instance path of its graph nodes, and its records without values, which the hash covers.
	readonly instance?: string;
	readonly records?: string;
};

// What a DOM update writes, as a vary name; undefined for a field's live value, which a kept part cannot take over.
function updatedName(target: DomUpdate['target']): string | undefined {
	if (!target || target.kind === 'text') return PROTOCOL_VARY_TEXT;
	if (target.kind === 'class' || target.kind === 'style') return target.kind;
	if (target.kind !== 'attribute' || typeof target.name !== 'string') return undefined;
	return target.name;
}

// The instance path this page gives the part's own nodes: a page-space locator less the part's own spelling of it.
function instancePath(child: object, view: SsrDataChildView): string | undefined {
	const given = (child as { readonly instancePath?: unknown }).instancePath;
	if (typeof given === 'string') return given;
	const placed = (
		child as { readonly structure?: { readonly locators?: ReadonlyArray<Locator> } }
	).structure?.locators;
	const own = view.locators?.[0];
	if (!own || typeof own.hostNodeId !== 'string') return undefined;
	const id = placed?.find((locator) => locator.index === own.index)?.hostNodeId;
	return typeof id === 'string' && id.endsWith(own.hostNodeId)
		? id.slice(0, id.length - own.hostNodeId.length)
		: undefined;
}

// Its own props, and the computed values that read nothing else.
function fromProps(child: SsrDataChildOutput): (id: unknown) => boolean {
	const derived = new Set<unknown>();
	const reads = (id: unknown) => isProp(id) || derived.has(id);
	for (let grew = true; grew;) {
		grew = false;
		for (const computed of child.state?.computed ?? [])
			if (
				!computed.async &&
				!derived.has(computed.graphNodeId) &&
				(computed.dependencies ?? []).every((dependency) => reads(dependency.graphNodeId))
			) {
				derived.add(computed.graphNodeId);
				grew = true;
			}
	}
	return reads;
}

// A part with state stays when nothing its state drives moves nodes: lists only over its props; no branches, async content or behaviours.
function statefulPart(child: SsrDataChildOutput, view: SsrDataChildRecords): KeptPart | undefined {
	const props = fromProps(child);
	if (
		view.keyedRepeats?.some((repeat) => !props(repeat.collectionGraphNodeId)) ||
		view.branches?.length ||
		view.asyncBoundaries?.length ||
		view.behaviors?.length ||
		(child.state?.computed ?? []).some((computed) => computed.async)
	)
		return undefined;
	const locators = new Map((view.locators ?? []).map((locator) => [locator.hostNodeId, locator]));
	const at = (hostNodeId: unknown) => {
		const locator = locators.get(hostNodeId);
		return locator?.strategy === 'dom-order' && typeof locator.index === 'number'
			? locator.index
			: undefined;
	};
	const sites: VaryingSite[] = [];
	for (const update of view.domUpdates ?? []) {
		if (isChildrenUpdate(update)) continue;
		const index = at(update.hostNodeId);
		const name = updatedName(update.target);
		if (index === undefined || !name) return undefined;
		sites.push({ index, name });
	}
	for (const event of view.events ?? []) {
		const index = at(event.hostNodeId);
		if (index === undefined) return undefined;
		sites.push({ index, name: PROTOCOL_EVENT_HOST_ATTRIBUTE });
	}
	const instance = instancePath(child, view);
	if (instance === undefined) return undefined;
	const { state, view: records } = child as { state?: unknown; view?: unknown };
	return { sites, instance, records: JSON.stringify([state, records], withoutValues) };
}

// Served values differ between pages; the records' shape is what names the part.
function withoutValues(key: string, value: unknown): unknown {
	return key === 'value' || key === 'directValue' || key === 'snapshot' || key === 'index'
		? undefined
		: value;
}

// Undefined when an update other than a prop-set attribute or the `{children}` slot remains.
function varyingSites(
	child: SsrDataChildOutput,
	view: SsrDataChildView,
): VaryingSite[] | undefined {
	const values = propValues(child) ?? new Set();
	const locators = new Map((view.locators ?? []).map((locator) => [locator.hostNodeId, locator]));
	const sites: VaryingSite[] = [];
	const located = new Set<unknown>();
	for (const update of view.domUpdates ?? []) {
		if (isChildrenUpdate(update)) continue;
		const locator = locators.get(update.hostNodeId);
		if (
			update.target?.kind !== 'attribute' ||
			typeof update.target.name !== 'string' ||
			(!isProp(update.graphNodeId) && !values.has(update.graphNodeId)) ||
			locator?.strategy !== 'dom-order' ||
			typeof locator.index !== 'number'
		)
			return undefined;
		located.add(update.hostNodeId);
		sites.push({ index: locator.index, name: update.target.name });
	}
	const childrenLocators = (view.locators?.length ?? 0) - located.size;
	const children = (view.domUpdates ?? []).filter(isChildrenUpdate).length;
	return childrenLocators <= children ? sites : undefined;
}

const OPENING_TAG = /^\s*<([a-zA-Z][\w-]*)/;
// Below this much markup a kept part saves less than its own mark costs.
const KEEP_MIN_CHARS = 512;
const NESTED_KEEP = new RegExp(
	` (?:${PROTOCOL_KEEP_ATTRIBUTE}="[0-9a-z]+"|${PROTOCOL_KEEP_INSTANCE_ATTRIBUTE}="[^"]*")`,
	'g',
);

/**
 * A presentational child's root element gets a hash of its markup without the page's children and its prop-set
 * attribute values, and the element holding exactly those children is marked as the page's own.
 */
function keepMarked(
	html: string,
	projected: string | undefined,
	part: KeptPart | undefined,
): string {
	if (!part || !OPENING_TAG.test(html)) return html;
	const varying = markVarying(html, part.sites);
	if (!varying) return html;
	const { marked, shape } = varying;
	const hash = (kept: string) => hashText(part.records ? `${kept}\n${part.records}` : kept);
	const rooted = (html: string, kept: string) => mark(html, hash(kept), part.instance);
	if (!projected) {
		const kept = shape.replace(NESTED_KEEP, '');
		return kept.length < KEEP_MIN_CHARS ? html : rooted(marked.replace(NESTED_KEEP, ''), kept);
	}
	// The page's children appear once, verbatim, as the whole content of one element; or this output is not kept.
	const own = ownSlot(marked, projected);
	const shapeOwn = own && ownSlot(shape, projected);
	if (!own || !shapeOwn) return html;
	const before = marked.slice(0, own.start - 1).replace(NESTED_KEEP, '');
	const after = marked.slice(own.end).replace(NESTED_KEEP, '');
	const kept =
		shape.slice(0, shapeOwn.start - 1).replace(NESTED_KEEP, '') +
		'>' +
		shape.slice(shapeOwn.end).replace(NESTED_KEEP, '');
	if (kept.length < KEEP_MIN_CHARS) return html;
	return rooted(`${before} ${PROTOCOL_OWN_ATTRIBUTE}>${projected}${after}`, kept);
}

function ownSlot(html: string, projected: string): { start: number; end: number } | undefined {
	const start = html.indexOf(projected);
	if (start === -1 || html.indexOf(projected, start + 1) !== -1) return undefined;
	const end = start + projected.length;
	const tagStart = html.lastIndexOf('<', start - 1);
	const name = /^<([a-zA-Z][\w-]*)[^<>]*>$/.exec(html.slice(tagStart, start))?.[1];
	return name && html.startsWith(`</${name}`, end) ? { start, end } : undefined;
}

const ATTRIBUTE_NAME = /^[a-zA-Z_:][\w:.-]*$/;
// A field's live state follows these only until someone edits it, so a part that varies them is not kept.
const CONTROL_STATE = /^(value|checked|selected)$/i;
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const ATTRIBUTE = /(\s+)([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?|[\s\S]/y;

// A start tag's attribute text without the named attributes, read one attribute at a time so no value is searched.
function withoutAttributes(text: string, names: readonly string[]): string {
	const dropped = new Set(names.map((name) => name.toLowerCase()));
	let kept = '';
	ATTRIBUTE.lastIndex = 0;
	for (let match = ATTRIBUTE.exec(text); match; match = ATTRIBUTE.exec(text))
		if (!match[2] || !dropped.has(match[2].toLowerCase())) kept += match[0];
	return kept;
}

function startTagEnd(html: string, at: number): number {
	let quote = '';
	for (let index = at; index < html.length; index++) {
		const char = html[index]!;
		if (quote) {
			if (char === quote) quote = '';
		} else if (char === '"' || char === "'") quote = char;
		else if (char === '>') return index;
	}
	return -1;
}

type StartTag = { readonly nameEnd: number; readonly end: number };

function* startTags(html: string): Generator<StartTag | undefined> {
	let at = html.indexOf('<');
	while (at !== -1) {
		if (html.startsWith('<!--', at)) {
			const close = html.indexOf('-->', at + 4);
			if (close === -1) return;
			at = html.indexOf('<', close + 3);
			continue;
		}
		const name = /^<([a-zA-Z][\w:.-]*)/.exec(html.slice(at, at + 64))?.[1];
		if (!name) {
			at = html.indexOf('<', at + 1);
			continue;
		}
		const end = startTagEnd(html, at + 1 + name.length);
		if (end === -1) return yield undefined;
		yield { nameEnd: at + 1 + name.length, end };
		let next = end + 1;
		if (RAW_TEXT.has(name.toLowerCase())) {
			const close = html.toLowerCase().indexOf(`</${name.toLowerCase()}`, next);
			if (close === -1) return;
			next = close;
		}
		at = html.indexOf('<', next);
	}
}

const VOID = new Set([
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

// The text directly inside the element whose start tag ends before `from`, as ranges, up to its own end tag.
function directText(html: string, from: number): Array<[number, number]> | undefined {
	const runs: Array<[number, number]> = [];
	let depth = 0;
	for (let at = from; at < html.length;) {
		const open = html.indexOf('<', at);
		if (open === -1) return undefined;
		if (depth === 0 && open > at) runs.push([at, open]);
		if (html.startsWith('<!--', open)) {
			const close = html.indexOf('-->', open + 4);
			if (close === -1) return undefined;
			at = close + 3;
			continue;
		}
		if (html[open + 1] === '/') {
			if (depth-- === 0) return runs;
			at = html.indexOf('>', open) + 1;
			if (at === 0) return undefined;
			continue;
		}
		const name = /^<([a-zA-Z][\w:.-]*)/.exec(html.slice(open, open + 64))?.[1]?.toLowerCase();
		const end = name ? startTagEnd(html, open + 1 + name.length) : -1;
		if (end === -1) return undefined;
		at = end + 1;
		if (RAW_TEXT.has(name!)) {
			const close = html.toLowerCase().indexOf(`</${name}`, at);
			if (close === -1) return undefined;
			at = html.indexOf('>', close) + 1;
		} else if (!VOID.has(name!) && html[end - 1] !== '/') depth++;
	}
	return undefined;
}

const VARY_MARK = new RegExp(`\\s${PROTOCOL_VARY_ATTRIBUTE}="([^"]*)"`);

// Elements count in document order, as the component's dom-order locators do.
function markVarying(
	html: string,
	sites: readonly VaryingSite[],
): { readonly marked: string; readonly shape: string } | undefined {
	if (!sites.length) return { marked: html, shape: html };
	const names = new Map<number, Set<string>>();
	for (const site of sites) {
		if (
			site.name !== PROTOCOL_VARY_TEXT &&
			(!ATTRIBUTE_NAME.test(site.name) || CONTROL_STATE.test(site.name))
		)
			return undefined;
		names.set(site.index, (names.get(site.index) ?? new Set()).add(site.name));
	}
	let marked = '';
	let shape = '';
	let from = 0;
	let index = 0;
	let found = 0;
	// Text a part writes leaves the hash; it is cut from the shape once the copy reaches it.
	const cuts: Array<[number, number]> = [];
	const copy = (to: number) => {
		marked += html.slice(from, to);
		let at = from;
		for (const [start, end] of cuts) {
			if (end <= at || start >= to) continue;
			shape += html.slice(at, Math.max(at, start));
			at = Math.min(end, to);
		}
		shape += html.slice(at, to);
		from = to;
	};
	for (const tag of startTags(html)) {
		if (!tag) return undefined;
		const varying = names.get(index++);
		if (!varying) continue;
		copy(tag.nameEnd);
		let text = html.slice(tag.nameEnd, tag.end);
		// A part inside this one marked its own prop-set attributes: one mark names both.
		const nested = VARY_MARK.exec(text);
		if (nested) {
			for (const name of nested[1]!.split(' ')) varying.add(name);
			text = text.replace(VARY_MARK, '');
		}
		const list = [...varying].sort();
		const vary = ` ${PROTOCOL_VARY_ATTRIBUTE}="${list.join(' ')}"`;
		marked += vary + text;
		shape += vary + withoutAttributes(text, list);
		from = tag.end;
		if (varying.has(PROTOCOL_VARY_TEXT)) {
			const runs = directText(html, tag.end + 1);
			if (!runs) return undefined;
			cuts.push(...runs);
			cuts.sort((a, b) => a[0] - b[0]);
		}
		if (++found === names.size) break;
	}
	if (found !== names.size) return undefined;
	copy(html.length);
	return { marked, shape };
}

function mark(html: string, hash: string, instance: string | undefined): string {
	const root = OPENING_TAG.exec(html)!;
	const at = root.index + root[0].length;
	const own = instance === undefined ? '' : ` ${PROTOCOL_KEEP_INSTANCE_ATTRIBUTE}="${instance}"`;
	return `${html.slice(0, at)} ${PROTOCOL_KEEP_ATTRIBUTE}="${hash}"${own}${html.slice(at)}`;
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
// one present must be empty but for the attributes props set. A nested component's anchor is only structure.
function keptPart(child: object): KeptPart | undefined {
	const view = (child as { readonly view?: SsrDataChildRecords }).view;
	const coordinates = (child as { readonly coordinates?: Coordinates }).coordinates;
	if (!view && !coordinates) return undefined;
	if (coordinates && !coordinates.anchors.every((anchor) => anchor.kind === 'child-component'))
		return undefined;
	if (!view) return coordinates!.locators.length === 0 ? { sites: [] } : undefined;
	const stateless =
		(coordinates?.locators.length ?? 0) === 0 &&
		(view.keyedRepeats?.length ?? 0) === 0 &&
		noResumeRecords(child as SsrDataChildOutput, view);
	const sites = stateless ? varyingSites(child as SsrDataChildOutput, view) : undefined;
	return sites ? { sites } : statefulPart(child as SsrDataChildOutput, view);
}

const keepParts: KeepParts = (html, projected, child) =>
	keepMarked(html, projected, keptPart(child));

/** Installs keep-parts for every render in this process. */
export function installKeepParts(): void {
	(globalThis as { [KEEP_PARTS_HOOK]?: KeepParts })[KEEP_PARTS_HOOK] = keepParts;
}
