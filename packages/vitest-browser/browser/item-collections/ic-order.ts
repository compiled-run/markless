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

/**
 * The places the roster holds, reported and never written: `ui-pos` is the
 * family's own derived attribute, so a handler that stamped it would hide
 * whether the derivation answered.
 */
export function readPositions(items: readonly HTMLElement[]): string {
	return items.map((_one, at) => `${at}`).join(',');
}
