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

// The same grammar over a HOST id, which ends in its own `h<n>` segment rather
// than a page-space id.
const HOST_INSTANCE_PATH = /^(?:[cp]\d+:|r:[^:]*:)+/;

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
	// Which rendered widget a host sits in, for a reader that cannot say. A bound
	// symbol is minted per component EDGE, so a handler dispatched through one
	// carries no instance path; the handles its own host bound are already
	// qualified with the widget's root path, and one host sits in one instance.
	// `null` is two roots claiming one host, which must not answer.
	const widgetRootByHostPath = new Map<string, string | null>();
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
		const rootPath = HANDLE_INSTANCE_PATH.exec(handle.handleId)?.[0];
		if (rootPath) {
			const hostPath = HOST_INSTANCE_PATH.exec(hostNodeId)?.[0] ?? '';
			const noted = widgetRootByHostPath.get(hostPath);
			widgetRootByHostPath.set(
				hostPath,
				noted === undefined || noted === rootPath ? rootPath : null,
			);
		}
	}
	for (const handle of handles) {
		const element = elementsByHostId.get(handle.hostNodeId);
		if (element) register(handle.hostNodeId, handle, element);
	}
	return {
		get(id) {
			const filed = byKey.get(id);
			if (!filed || filed.length === 0) return undefined;
			if (filed.length > 1) throw ambiguousElementHandleError(id, filed.length);
			return connectedElement(root, filed[0]);
		},
		widgetRootPath(hostNodeId) {
			return widgetRootByHostPath.get(HOST_INSTANCE_PATH.exec(hostNodeId)?.[0] ?? '') ?? undefined;
		},
		register,
		deleteHost,
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
