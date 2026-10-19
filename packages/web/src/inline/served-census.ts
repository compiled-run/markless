// Serialized into the inline boots as text: keep it free of imports and outer names; the serializer fills the marker names.
declare const __MARKLESS_PAGE_START__: string;
declare const __MARKLESS_PAGE_END__: string;

/**
 * Pins the container's elements in DOM order as its census and returns them,
 * between the page start and end markers an author's element carries. When the
 * count differs from the one the server measured, a script outside Markless
 * changed the page first: the root is flagged for the resume module to renumber
 * the census, and no elements are returned, so nothing is matched by a shifted index.
 */
export function marklessServedCensus(
	root: Element & { __marklessCensus?: Array<Element | null>; __marklessShifted?: number },
	attribute: string,
): Element[] {
	const live: Element[] = [root];
	const walker = document.createTreeWalker(root, 129);
	for (let next = walker.nextNode(); next; next = walker.nextNode())
		if (next.nodeType !== 8) live.push(next as Element);
		else if ((next as Comment).data === __MARKLESS_PAGE_START__) live.length = 1;
		else if ((next as Comment).data === __MARKLESS_PAGE_END__) break;
	root.__marklessCensus ||= live;
	const value = root.getAttribute?.(attribute);
	return value && parseInt(value) !== live.length ? ((root.__marklessShifted = 1), []) : live;
}
