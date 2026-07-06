type DomNode = {
	readonly nodeType: number;
	readonly childNodes?: ArrayLike<DomNode>;
};

type DomElement = DomNode & {
	readonly nodeType: 1;
	readonly tagName: string;
};

export function marklessLocateHost(root: DomElement, locators, elementsByHostId: Map<string, DomElement>, hostNodeId: string): DomElement | undefined {
	const cached = elementsByHostId.get(hostNodeId);
	if (cached) return cached;
	const locator = locators.find((candidate) => candidate.hostNodeId === hostNodeId);
	if (!locator) return undefined;
	const element = marklessElementAtDomOrderIndex(root, locator.index);
	if (!element || (locator.tagName !== '*' && element.tagName.toLowerCase() !== locator.tagName.toLowerCase())) return undefined;
	elementsByHostId.set(hostNodeId, element);
	return element;
}

function marklessElementAtDomOrderIndex(root: DomElement, index: number): DomElement | undefined {
	let currentIndex = 0;
	let found: DomElement | undefined;
	const visit = (node: DomNode): void => {
		if (found) return;
		if (node.nodeType === 1) {
			if (currentIndex === index) {
				found = node as DomElement;
				return;
			}
			currentIndex++;
		}
		for (const child of Array.from(node.childNodes ?? [])) visit(child);
	};
	visit(root);
	return found;
}
