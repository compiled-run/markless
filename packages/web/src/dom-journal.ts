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
};

type DomRangeParent = {
	readonly childNodes: ArrayLike<DomRangeNode>;
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
	for (const node of fragmentNodes(fragment)) {
		parent.insertBefore(node, before);
	}
}

function removeRange(start: unknown, end: unknown): void {
	if (!isDomRangeNode(start) || !isDomRangeNode(end)) return;

	const parent = start.parentNode;
	if (!parent || parent !== end.parentNode) return;

	let next = nextSibling(parent, start);
	while (next && next !== end) {
		const current = next;
		next = nextSibling(parent, current);
		parent.removeChild(current);
	}
}

function moveRange(start: unknown, end: unknown, before: unknown): void {
	if (!isDomRangeNode(start) || !isDomRangeNode(end) || !isDomRangeNode(before)) return;

	const parent = start.parentNode;
	const beforeParent = before.parentNode;
	if (!parent || !beforeParent || parent !== end.parentNode) return;

	for (const node of rangeContents(start, end)) {
		beforeParent.insertBefore(node, before);
	}
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
