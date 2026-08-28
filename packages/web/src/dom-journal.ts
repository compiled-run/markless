import type { DomJournalEntry } from '@markless/runtime';
import type { ResumeDomComment, ResumeDomElement, ResumeDomNode } from './resume-types.ts';
import { marklessAttributeValue } from './dom-attribute.ts';
import { marklessControlWriteHeld } from './control-edit-hold.ts';
import { spliceCensus } from './resume-census.ts';

type InsertRangeEntry = Extract<DomJournalEntry, { readonly type: 'insertRange' }>;
type RemoveRangeEntry = Extract<DomJournalEntry, { readonly type: 'removeRange' }>;
type MoveRangeEntry = Extract<DomJournalEntry, { readonly type: 'moveRange' }>;

export type AsyncBoundarySnapshotFragment = {
	readonly type: 'async-boundary-snapshot';
	readonly boundaryId: string;
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly snapshot: unknown;
};

type DomRangeNode = {
	readonly parentNode?: DomRangeParent | null;
	readonly nodeType?: number;
	readonly childNodes?: ArrayLike<DomRangeNode>;
};

type DomRangeParent = {
	readonly childNodes: ArrayLike<DomRangeNode>;
	readonly parentNode?: DomRangeParent | null;
	insertBefore: (node: DomRangeNode, before: DomRangeNode | null) => DomRangeNode;
	removeChild: (node: DomRangeNode) => DomRangeNode;
};

export type DomJournalApplyTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export type DomJournalApplyOptions = {
	readonly resolveTarget: (locator: string, entry: DomJournalEntry) => unknown;
	readonly runCleanup?: (cleanupId: string, entry: DomJournalEntry) => void;
	readonly insertRange?: (
		anchorLocator: string,
		fragment: unknown,
		entry: InsertRangeEntry,
	) => void;
	readonly removeRange?: (rangeLocator: string, entry: RemoveRangeEntry) => void;
	readonly moveRange?: (
		rangeLocator: string,
		beforeLocator: string,
		entry: MoveRangeEntry,
	) => void;
	readonly renderAsyncSnapshot?: (
		fragment: AsyncBoundarySnapshotFragment,
		entry: InsertRangeEntry,
	) => unknown;
};

export function applyDomJournalEntries(
	entries: ReadonlyArray<DomJournalEntry>,
	options: DomJournalApplyOptions,
): void {
	for (const entry of entries) {
		if (entry.type === 'runCleanup') {
			options.runCleanup?.(entry.locator, entry);
			continue;
		}

		if (entry.type === 'insertRange') {
			if (options.insertRange) {
				options.insertRange(entry.locator, entry.fragment, entry);
			} else {
				insertRange(
					options.resolveTarget(entry.locator, entry),
					renderInsertRangeFragment(entry.fragment, entry, options),
				);
			}
			continue;
		}

		if (entry.type === 'removeRange') {
			if (options.removeRange) {
				options.removeRange(entry.locator, entry);
			} else {
				removeRange(
					options.resolveTarget(`${entry.locator}:start`, entry),
					options.resolveTarget(`${entry.locator}:end`, entry),
				);
			}
			continue;
		}

		if (entry.type === 'moveRange') {
			if (options.moveRange) {
				options.moveRange(entry.locator, entry.before, entry);
			} else {
				moveRange(
					options.resolveTarget(`${entry.locator}:start`, entry),
					options.resolveTarget(`${entry.locator}:end`, entry),
					options.resolveTarget(entry.before, entry),
				);
			}
			continue;
		}

		const target = options.resolveTarget(entry.locator, entry);
		if (!target) continue;

		if (entry.type === 'setText') {
			setText(target, entry.value);
			continue;
		}

		if (entry.type === 'setAttr') {
			setAttr(target, entry.name, entry.value);
			continue;
		}

		if (entry.type === 'setProp') {
			setProp(target, entry.name, entry.value);
			continue;
		}

		throw new TypeError(`Unsupported DOM journal entry "${entry.type}".`);
	}
}

// Every ancestor's pinned census is spliced, not re-derived: this module moves
// ranges anywhere under a resumed root.
function spliceDomOrderCensus(
	parent: DomRangeParent,
	removed: ReadonlyArray<DomRangeNode>,
	inserted: ReadonlyArray<DomRangeNode>,
): void {
	for (let node: DomRangeParent | null | undefined = parent; node; node = node.parentNode) {
		const census = (node as { __marklessCensus?: DomRangeNode[] }).__marklessCensus;
		if (census) spliceCensus(census, removed, inserted);
	}
}

function renderInsertRangeFragment(
	fragment: unknown,
	entry: InsertRangeEntry,
	options: DomJournalApplyOptions,
): unknown {
	if (isAsyncBoundarySnapshotFragment(fragment)) {
		return options.renderAsyncSnapshot?.(fragment, entry);
	}

	return fragment;
}

// Rewriting a node with what it already holds is still a mutation, and an
// aria-live region announces on it; every write below elides a no-op.
function setText(target: unknown, value: unknown): void {
	const host = target as { textContent: string };
	const text = stringifyDomValue(value);
	if (host.textContent === text) return;
	host.textContent = text;
}

function setAttr(target: unknown, name: string, value: unknown): void {
	const element = target as DomJournalApplyTarget;
	const text = marklessAttributeValue(name, value);
	if (text === null) {
		element.removeAttribute?.(name);
		return;
	}

	if (readAttribute(element, name) === text) return;
	element.setAttribute?.(name, text);
}

function readAttribute(element: DomJournalApplyTarget, name: string): string | null | undefined {
	const read = (element as { getAttribute?: (name: string) => string | null }).getAttribute;
	return typeof read === 'function' ? read.call(element, name) : undefined;
}

function setProp(target: unknown, name: string, value: unknown): void {
	if (marklessControlWriteHeld(target, name, value)) return;
	(target as Record<string, unknown>)[name] = value;
}

function insertRange(anchor: unknown, fragment: unknown): void {
	if (!isDomRangeNode(anchor)) return;

	const parent = anchor.parentNode;
	if (!parent) return;

	const before = nextSibling(parent, anchor);
	const nodes = fragmentNodes(fragment);
	for (const node of nodes) {
		parent.insertBefore(node, before);
	}
	spliceDomOrderCensus(parent, [], nodes);
}

function removeRange(start: unknown, end: unknown): void {
	if (!isDomRangeNode(start) || !isDomRangeNode(end)) return;

	const parent = start.parentNode;
	if (!parent || parent !== end.parentNode) return;

	const removed = rangeContents(start, end);
	for (const node of removed) parent.removeChild(node);
	spliceDomOrderCensus(parent, removed, []);
}

function moveRange(start: unknown, end: unknown, before: unknown): void {
	if (!isDomRangeNode(start) || !isDomRangeNode(end) || !isDomRangeNode(before)) return;

	const parent = start.parentNode;
	const beforeParent = before.parentNode;
	if (!parent || !beforeParent || parent !== end.parentNode) return;

	const moved = rangeContents(start, end);
	for (const node of moved) {
		beforeParent.insertBefore(node, before);
	}
	spliceDomOrderCensus(beforeParent, moved, moved);
}

function rangeContents(start: DomRangeNode, end: DomRangeNode): DomRangeNode[] {
	const parent = start.parentNode;
	if (!parent || parent !== end.parentNode) return [];

	const nodes: DomRangeNode[] = [];
	let next = nextSibling(parent, start);
	while (next && next !== end) {
		nodes.push(next);
		next = nextSibling(parent, next);
	}

	return nodes;
}

function fragmentNodes(fragment: unknown): DomRangeNode[] {
	if (Array.isArray(fragment)) return fragment.filter(isDomRangeNode);
	if (isDomRangeNode(fragment)) return [fragment];
	return [];
}

function nextSibling(parent: DomRangeParent, node: DomRangeNode): DomRangeNode | null {
	const childNodes = Array.from(parent.childNodes);
	const index = childNodes.indexOf(node);
	return index >= 0 ? (childNodes[index + 1] ?? null) : null;
}

function isDomRangeNode(value: unknown): value is DomRangeNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		('parentNode' in value || 'nodeType' in value)
	);
}

function isAsyncBoundarySnapshotFragment(value: unknown): value is AsyncBoundarySnapshotFragment {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { readonly type?: unknown }).type === 'async-boundary-snapshot'
	);
}

type ComparableNode = DomRangeNode & {
	readonly nodeName?: string;
	readonly nodeValue?: string | null;
	readonly attributes?: ArrayLike<{ readonly name: string; readonly value: string }>;
};

// Whether a range already holds, node for node, what a fragment would put back.
// Replacing a range with itself is still a mutation an aria-live region
// announces on, and it still drops the focus, selection and claimed hosts the
// standing nodes carry. An empty range has none of those, so it is not compared.
export function domRangeMatchesFragment(start: unknown, end: unknown, fragment: unknown): boolean {
	if (!isDomRangeNode(start) || !isDomRangeNode(end)) return false;
	const live = rangeContents(start, end);
	const fresh = fragmentNodes(fragment);
	if (live.length === 0 || live.length !== fresh.length) return false;
	for (let index = 0; index < live.length; index++)
		if (!sameRenderedNode(live[index]!, fresh[index]!)) return false;
	return true;
}

function sameRenderedNode(live: ComparableNode, fresh: ComparableNode): boolean {
	if (live.nodeType !== fresh.nodeType) return false;
	if (live.nodeType !== 1) return (live.nodeValue ?? '') === (fresh.nodeValue ?? '');
	if (live.nodeName !== fresh.nodeName || !sameAttributes(live, fresh)) return false;
	const liveChildren = live.childNodes ?? [];
	const freshChildren = fresh.childNodes ?? [];
	if (liveChildren.length !== freshChildren.length) return false;
	for (let index = 0; index < liveChildren.length; index++)
		if (!sameRenderedNode(liveChildren[index]!, freshChildren[index]!)) return false;
	return true;
}

// A host that answers no attributes cannot be compared, so it never matches.
function sameAttributes(live: ComparableNode, fresh: ComparableNode): boolean {
	const standing = live.attributes;
	const rendered = fresh.attributes;
	if (!standing || !rendered || standing.length !== rendered.length) return false;
	const byName = new Map<string, string>();
	for (let index = 0; index < standing.length; index++)
		byName.set(standing[index]!.name, standing[index]!.value);
	for (let index = 0; index < rendered.length; index++)
		if (byName.get(rendered[index]!.name) !== rendered[index]!.value) return false;
	return true;
}

// The removal walk lives here rather than in the branch runtime, whose static
// closure is byte-walled; a removal flush loads this module anyway.
export function hostIdsInsideRange(
	root: ResumeDomElement,
	startAnchor: ResumeDomComment,
	endAnchor: ResumeDomComment,
	elementsByHostId: Map<string, ResumeDomElement>,
): string[] {
	const inside = elementsBetweenAnchors(root, startAnchor, endAnchor);
	const ids: string[] = [];
	for (const [id, element] of elementsByHostId)
		for (const removed of inside)
			if (containsElement(removed, element)) {
				ids.push(id);
				break;
			}
	return ids;
}

function elementsBetweenAnchors(
	root: ResumeDomElement,
	startAnchor: ResumeDomComment,
	endAnchor: ResumeDomComment,
): Set<ResumeDomElement> {
	const inside = new Set<ResumeDomElement>();
	let within = false;
	function visit(node: ResumeDomNode): void {
		if (node === startAnchor) {
			within = true;
			return;
		}
		if (node === endAnchor) {
			within = false;
			return;
		}
		if (within && node.nodeType === 1) inside.add(node as ResumeDomElement);
		for (const child of node.childNodes ?? []) visit(child);
	}
	visit(root);
	return inside;
}

function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}
