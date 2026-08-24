import type {
	ElementHandleRegistry,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from './resume-types.ts';
import {
	ambiguousElementHandleError,
	mismatchedElementLocatorError,
	missingElementLocatorError,
} from './inline/resume-errors.ts';

export function materializeDomLocators(
	root: ResumeDomElement,
	locators: ResumeViewRecord['locators'],
): Map<string, ResumeDomElement> {
	// Taken once per container, before any authored symbol can run, and held by
	// element reference: a foreign node swap cannot renumber a pinned census.
	// The slot lives on the root, not a module WeakMap, so the wake chunk
	// (fns/dom-order.ts) shares it without a chunk-regrouping import edge.
	const elements = (root.__marklessCensus ??= walkElements([root])),
		byHostId = new Map<string, ResumeDomElement>();
	for (const locator of locators) {
		const element = elements[locator.index];
		if (!element) throw missingElementLocatorError(locator);
		const expected = locator.tagName.toLowerCase(),
			actual = element.tagName.toLowerCase();
		if (expected !== '*' && actual !== expected)
			throw mismatchedElementLocatorError(locator, actual);
		byHostId.set(locator.hostNodeId, element);
	}
	return byHostId;
}

// The instance path a composed widget-scoped handle id carries, restated here
// for the reason fns/instance-scope.ts restates the serializer's grammar: the
// lean resume chunk strips one prefix rather than taking an import edge for it.
const HANDLE_INSTANCE_PATH = /^(?:[cp]\d+:|r:[^:]*:)+(?=shared:)/;

/**
 * One element per key, and a loud refusal when a key names more than one.
 *
 * A widget-scoped handle is one element PER RENDERED WIDGET, so composition
 * qualifies its id with the rendered widget's own root path and the reading
 * handler asks with the same path. Every registration is filed under three keys
 * all the same: that qualified id, the id exactly as the module compiled it, and
 * the handle's name — the last two are how a single-instance page, and a handler
 * whose instance the qualification could not name, still resolve.
 *
 * Which is why the multi-registration case throws instead of answering. Two
 * rendered widgets file the same compiled id and the same name; handing back
 * whichever registered last is the defect this registry exists to end, and it is
 * silent — the handler runs, touches a real element, and the wrong one moves.
 */
export function materializeElementHandles(
	root: ResumeDomElement,
	elementsByHostId: Map<string, ResumeDomElement>,
	handles: ResumeViewRecord['elementHandles'],
	// Row-owned handles are not registered: their elements are whatever the
	// repeat's live children hold at READ time, so a reorder or a removal needs
	// no bookkeeping to stay true. See rowMembers().
	keyedRepeats: ResumeViewRecord['keyedRepeats'] = [],
): ElementHandleRegistry {
	type Held = {
		readonly handleId: string;
		readonly keys: ReadonlyArray<string>;
		readonly element: ResumeDomElement;
	};
	// One element routinely carries more than one handle - a library part binds
	// its family's own, and the consumer binds theirs onto the same tag - so a
	// host holds a LIST. Filing one per host drops whichever registered first.
	const byKey = new Map<string, ResumeDomElement[]>(),
		heldByHostId = new Map<string, Held[]>();
	function unfile(held: Held): void {
		for (const key of held.keys) {
			const filed = byKey.get(key);
			if (!filed) continue;
			const at = filed.indexOf(held.element);
			if (at >= 0) filed.splice(at, 1);
			if (filed.length === 0) byKey.delete(key);
		}
	}
	function deleteHost(hostNodeId: string): void {
		const held = heldByHostId.get(hostNodeId);
		if (!held) return;
		for (const entry of held) unfile(entry);
		heldByHostId.delete(hostNodeId);
	}
	function register(
		hostNodeId: string,
		handle: { readonly handleId: string; readonly name: string },
		element: ResumeDomElement,
	): void {
		const held = heldByHostId.get(hostNodeId) ?? [];
		// The same handle registered again on the same host replaces its own entry
		// rather than doubling it, which would read as two rendered widgets and
		// refuse. Every OTHER handle on that host stays exactly where it is.
		for (let index = held.length - 1; index >= 0; index--)
			if (held[index]!.handleId === handle.handleId) {
				unfile(held[index]!);
				held.splice(index, 1);
			}
		const keys = [
			...new Set([
				handle.handleId,
				handle.handleId.replace(HANDLE_INSTANCE_PATH, ''),
				handle.name,
			]),
		];
		for (const key of keys) {
			const filed = byKey.get(key);
			if (filed) filed.push(element);
			else byKey.set(key, [element]);
		}
		held.push({ handleId: handle.handleId, keys, element });
		heldByHostId.set(hostNodeId, held);
	}
	// The keys that answer as a SET, declared at `element<T[]>()` and stamped on
	// every record the handle produced. Empty on a page with no array handle.
	const pluralKeys = new Set<string>(),
		rowHandles = (keyedRepeats ?? []).flatMap((repeat) =>
			(repeat.rowElementHandles ?? []).map((handle) => ({ ...handle, repeat })),
		);
	for (const handle of [...handles, ...rowHandles])
		if (handle.plural)
			for (const key of [
				handle.handleId,
				handle.handleId.replace(HANDLE_INSTANCE_PATH, ''),
				handle.name,
			])
				pluralKeys.add(key);
	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (element) register(handle.hostNodeId, handle, element);
	}
	// Row members are walked, never filed: a repeat's rows ARE its parent's
	// element children, so insert, remove and reorder need no bookkeeping.
	function rowMembers(id: string): ResumeDomElement[] {
		const members: ResumeDomElement[] = [];
		for (const handle of rowHandles) {
			if (handle.handleId !== id && handle.name !== id) continue;
			const parent = elementsByHostId.get(handle.repeat.parentHostNodeId);
			for (const rowRoot of parent?.childNodes ?? []) {
				if (rowRoot.nodeType !== 1) continue;
				let node: ResumeDomNode | undefined = rowRoot;
				for (const index of handle.hostPath) node = node?.childNodes?.[index];
				if (node?.nodeType === 1) members.push(node as ResumeDomElement);
			}
		}
		return members;
	}
	return {
		// One key, one answer, and the DECLARATION decides which kind: an array
		// handle answers its live members in document order, every other handle
		// answers the one element and still refuses when a key names two.
		get(id) {
			if (!pluralKeys.has(id)) {
				const filed = byKey.get(id);
				if (!filed?.length) return undefined;
				if (filed.length > 1) throw ambiguousElementHandleError(id, filed.length);
				return connectedElement(root, filed[0]);
			}
			const live = new Set<ResumeDomElement>();
			for (const element of [...(byKey.get(id) ?? []), ...rowMembers(id)]) {
				const connected = connectedElement(root, element);
				if (connected) live.add(connected);
			}
			return documentOrder([...live]);
		},
		register,
		deleteHost,
	};
}

// Document order asked of the document, not of the pinned census: rows the
// runtime moved or appended are not in the census. Hosts with no comparison
// (the node test doubles) keep insertion order; those doubles never reorder.
function documentOrder(elements: ResumeDomElement[]): ResumeDomElement[] {
	const compare = (elements[0] as { readonly compareDocumentPosition?: unknown } | undefined)
		?.compareDocumentPosition;
	if (typeof compare !== 'function') return elements;
	return elements.sort((left, right) =>
		// DOCUMENT_POSITION_FOLLOWING (4) means right comes after left.
		((left as unknown as Node).compareDocumentPosition(right as unknown as Node) & 4) !== 0
			? -1
			: 1,
	);
}

export function connectedElement(
	root: ResumeDomElement,
	element: ResumeDomElement | undefined,
): ResumeDomElement | undefined {
	return element && containsElement(root, element) ? element : undefined;
}
export function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
export function elementsBetweenAnchors(
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
export function hostIdsInsideRemovedElements(
	elementsByHostId: Map<string, ResumeDomElement>,
	removed: Set<ResumeDomElement>,
): string[] {
	const ids: string[] = [];
	for (const [id, element] of elementsByHostId)
		for (const removedElement of removed)
			if (containsElement(removedElement, element)) {
				ids.push(id);
				break;
			}
	return ids;
}
// Framework range mutation renumbers the shipped shape, so the pinned census is
// spliced by exactly what the mutator moved. Re-deriving it from the live tree
// would renumber around foreign nodes the framework does not own.
export function spliceDomOrderCensus(
	root: ResumeDomElement,
	removed: Iterable<ResumeDomNode>,
	inserted: ReadonlyArray<ResumeDomNode>,
): void {
	const census = root.__marklessCensus;
	if (!census) return;
	for (const node of removed) {
		const at = census.indexOf(node as ResumeDomElement);
		if (at >= 0) census.splice(at, blockEnd(census, at) - at);
	}
	if (inserted.length)
		census.splice(insertionSlot(census, inserted[0]!), 0, ...walkElements(inserted));
}
function blockEnd(census: ResumeDomElement[], at: number): number {
	const inside = new Set<ResumeDomNode>(walkElements([census[at]!]));
	let end = at + 1;
	while (end < census.length && inside.has(census[end]!)) end++;
	return end;
}
function insertionSlot(census: ResumeDomElement[], first: ResumeDomNode): number {
	const parent = (first as ResumeDomElement).parentElement;
	if (!parent) return census.length;
	let slot = -1;
	for (const child of parent.childNodes ?? []) {
		if (child === first) break;
		const at = census.indexOf(child as ResumeDomElement);
		if (at >= 0) slot = blockEnd(census, at);
	}
	if (slot >= 0) return slot;
	const at = census.indexOf(parent);
	return at >= 0 ? at + 1 : census.length;
}
function walkElements(nodes: ReadonlyArray<ResumeDomNode>): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];
	(function visit(list: ReadonlyArray<ResumeDomNode>): void {
		for (const node of list) {
			if (node.nodeType === 1) elements.push(node as ResumeDomElement);
			visit(node.childNodes ?? []);
		}
	})(nodes);
	return elements;
}
