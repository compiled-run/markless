// Spliced by what a range mutation moved: re-deriving would renumber around foreign nodes.
type CensusNode = {
	readonly nodeType?: number;
	readonly childNodes?: ArrayLike<CensusNode>;
	readonly parentElement?: CensusNode | null;
	readonly parentNode?: CensusNode | null;
};

export function spliceCensus(
	census: CensusNode[],
	removed: Iterable<CensusNode>,
	inserted: ReadonlyArray<CensusNode>,
): void {
	for (const node of removed) {
		const at = census.indexOf(node);
		if (at >= 0) census.splice(at, blockEnd(census, at) - at);
	}
	if (inserted.length)
		census.splice(insertionSlot(census, inserted[0]!), 0, ...censusElements(inserted));
}

// fns/dom-order's element order, pushed one at a time: a spread blows the stack.
export function censusElements(nodes: ArrayLike<CensusNode>): CensusNode[] {
	const elements: CensusNode[] = [];
	(function visit(list: ArrayLike<CensusNode>): void {
		for (const node of Array.from(list)) {
			if (node.nodeType === 1) elements.push(node);
			const walker = (node as Node).ownerDocument?.createTreeWalker?.(node as Node, 1);
			if (walker) for (let next; (next = walker.nextNode());) elements.push(next);
			else if (node.childNodes) visit(node.childNodes);
		}
	})(nodes);
	return elements;
}

function blockEnd(census: CensusNode[], at: number): number {
	const inside = new Set<CensusNode>(censusElements([census[at]!]));
	let end = at + 1;
	while (end < census.length && inside.has(census[end]!)) end++;
	return end;
}

function insertionSlot(census: CensusNode[], first: CensusNode): number {
	const parent = first.parentElement ?? first.parentNode;
	if (!parent) return census.length;
	let slot = -1;
	for (const child of Array.from(parent.childNodes ?? [])) {
		if (child === first) break;
		const at = census.indexOf(child);
		if (at >= 0) slot = blockEnd(census, at);
	}
	if (slot >= 0) return slot;
	const at = census.indexOf(parent);
	return at >= 0 ? at + 1 : census.length;
}
