import type { DomJournalEntry } from '@markless/runtime';

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

// Range mutation renumbers the served shape, so every ancestor's pinned element
// census is spliced by exactly what moved — re-deriving it from the live tree
// would renumber around foreign nodes the framework does not own. The slot name
// is shared with resume-locators by literal, not import: a value edge from here
// regroups the chunk graph.
function spliceDomOrderCensus(
	parent: DomRangeParent,
	removed: ReadonlyArray<DomRangeNode>,
	inserted: ReadonlyArray<DomRangeNode>,
): void {
	for (let node: DomRangeParent | null | undefined = parent; node; node = node.parentNode) {
		const census = (node as { __marklessCensus?: DomRangeNode[] }).__marklessCensus;
		if (!census) continue;
		for (const one of removed) {
			const at = census.indexOf(one);
			if (at >= 0) census.splice(at, blockEnd(census, at) - at);
		}
		if (inserted.length)
			census.splice(insertionSlot(census, inserted[0]!), 0, ...censusElements(inserted));
	}
}

function blockEnd(census: DomRangeNode[], at: number): number {
	const inside = new Set<DomRangeNode>(censusElements([census[at]!]));
	let end = at + 1;
	while (end < census.length && inside.has(census[end]!)) end++;
	return end;
}

function insertionSlot(census: DomRangeNode[], first: DomRangeNode): number {
	const parent = first.parentNode;
	if (!parent) return census.length;
	let slot = -1;
	for (const child of Array.from(parent.childNodes)) {
		if (child === first) break;
		const at = census.indexOf(child);
		if (at >= 0) slot = blockEnd(census, at);
	}
	if (slot >= 0) return slot;
	const at = census.indexOf(parent as DomRangeNode);
	return at >= 0 ? at + 1 : census.length;
}

function censusElements(nodes: ArrayLike<DomRangeNode>): DomRangeNode[] {
	const elements: DomRangeNode[] = [];
	for (const node of Array.from(nodes)) {
		if (node.nodeType === 1) elements.push(node);
		if (node.childNodes) elements.push(...censusElements(node.childNodes));
	}
	return elements;
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

function setText(target: unknown, value: unknown): void {
	(target as { textContent: string }).textContent = stringifyDomValue(value);
}

function setAttr(target: unknown, name: string, value: unknown): void {
	const element = target as DomJournalApplyTarget;
	if (value == null || value === false) {
		element.removeAttribute?.(name);
		return;
	}

	element.setAttribute?.(name, stringifyDomValue(value));
}

function setProp(target: unknown, name: string, value: unknown): void {
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

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}
