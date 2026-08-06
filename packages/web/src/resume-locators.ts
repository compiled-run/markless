import type {
	ElementHandleRegistry,
	ResumeDomComment,
	ResumeDomElement,
	ResumeDomNode,
	ResumeViewRecord,
} from './resume-types.ts';
import {
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

export function materializeElementHandles(
	root: ResumeDomElement,
	elementsByHostId: Map<string, ResumeDomElement>,
	handles: ResumeViewRecord['elementHandles'],
): ElementHandleRegistry {
	const byHandleId = new Map<string, ResumeDomElement>(),
		byName = new Map<string, ResumeDomElement>(),
		keysByHostId = new Map<string, { readonly handleId: string; readonly name: string }>();
	function register(
		hostNodeId: string,
		handle: { readonly handleId: string; readonly name: string },
		element: ResumeDomElement,
	): void {
		byHandleId.set(handle.handleId, element);
		byName.set(handle.name, element);
		keysByHostId.set(hostNodeId, { handleId: handle.handleId, name: handle.name });
	}
	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (element) register(handle.hostNodeId, handle, element);
	}
	return {
		get: (id) => connectedElement(root, byHandleId.get(id) ?? byName.get(id)),
		register,
		deleteHost(hostNodeId) {
			const keys = keysByHostId.get(hostNodeId);
			if (!keys) return;
			byHandleId.delete(keys.handleId);
			byName.delete(keys.name);
			keysByHostId.delete(hostNodeId);
		},
	};
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
