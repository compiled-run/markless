// Render order, read off the roster of element() handles a family binds, with
// no DOM lookup: registration order is not page order, so the roster is sorted
// by document position before anything is counted.

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

export function orderedRoster(items: unknown): HTMLElement[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	const registered = items.filter((one): one is HTMLElement => one instanceof HTMLElement);
	return registered.sort((left, right) => {
		if (left === right) return 0;
		return (left.compareDocumentPosition(right) & FOLLOWING) !== 0 ? -1 : 1;
	});
}

/** Stamp each item with its place in the roster and report what was stamped. */
export function stampPositions(items: readonly HTMLElement[]): string {
	const places: string[] = [];
	for (let at = 0; at < items.length; at += 1) {
		items[at]?.setAttribute('ui-pos', `${at}`);
		places.push(`${at}`);
	}
	return places.join(',');
}
