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
	const elements = walkElements(root),
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
function walkElements(root: ResumeDomElement): ResumeDomElement[] {
	const elements: ResumeDomElement[] = [];
	(function visit(node: ResumeDomNode): void {
		if (node.nodeType === 1) elements.push(node as ResumeDomElement);
		for (const child of node.childNodes ?? []) visit(child);
	})(root);
	return elements;
}
