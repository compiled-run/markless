// Serialized into the inline boots as text: keep it free of imports and outer names.
/**
 * Pins the container's elements in DOM order as its census and returns them.
 * When the count differs from the one the server measured, a script outside
 * Markless changed the page first: the root is flagged for the resume module
 * to renumber the census, and no elements are returned, so nothing is matched
 * by a shifted index.
 */
export function marklessServedCensus(
	root: Element & { __marklessCensus?: Array<Element | null>; __marklessShifted?: number },
	attribute: string,
): Element[] {
	const live: Element[] = [root];
	const walker = document.createTreeWalker(root, 1);
	for (let next = walker.nextNode(); next; next = walker.nextNode()) live.push(next as Element);
	root.__marklessCensus ||= live;
	const value = root.getAttribute?.(attribute);
	return value && parseInt(value) !== live.length ? ((root.__marklessShifted = 1), []) : live;
}
