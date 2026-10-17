// Serialized into the inline boots as text: keep it free of imports and outer names.
/**
 * The container's elements in served DOM order. When a script outside Markless
 * has added, removed or swapped elements, each located element and its
 * ancestors are matched by tag among their parent's children instead, so a
 * change moves nothing outside the parent it happened in; served slots the
 * live page lacks stay null.
 */
export function marklessServedCensus(root: Element, attribute: string): Array<Element | null> {
	const live: Element[] = [root];
	const walker = document.createTreeWalker(root, 1);
	for (let next = walker.nextNode(); next; next = walker.nextNode()) live.push(next as Element);
	const value = root.getAttribute?.(attribute);
	if (!value || parseInt(value) === live.length) return live;
	const spec = value.split(';');
	const located = new Map<number, Element>([[0, root]]);
	const served = new Map<Element, number>([[root, 0]]);
	const reserved = new Set<number>();
	for (let entry = 1; entry < spec.length; entry++) {
		const [index, parentIndex, siblings, child, tag] = spec[entry]!.split(',');
		const children = located.get(+parentIndex!)?.children ?? [];
		// More children than served means insertions, so the match can only sit further right; fewer, further left.
		const extra = children.length - +siblings!;
		reserved.add(+index!);
		for (let at = +child!; extra < 0 ? at >= +child! + extra : at <= +child! + extra;) {
			const candidate = children[at];
			if (!candidate) break;
			if (!served.has(candidate) && candidate.localName === tag) {
				located.set(+index!, candidate);
				served.set(candidate, +index!);
				break;
			}
			at += extra < 0 ? -1 : 1;
		}
	}
	const census: Array<Element | null> = Array(+spec[0]!).fill(null);
	let next = 0;
	for (const element of live) {
		const index = served.get(element);
		if (index !== undefined) next = index;
		else {
			while (reserved.has(next) && !located.has(next)) next++;
			if (next >= census.length || located.has(next)) continue;
		}
		census[next++] = element;
	}
	return census;
}
