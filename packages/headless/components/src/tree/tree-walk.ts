/**
 * The tree's own parts, handed in as `element<T[]>()` members, answer every
 * question the root's keyboard used to ask the DOM. Members come back live and
 * in document order, so "which row am I on" is the deepest row holding the
 * event target and "is this row showing" is a containment test against the
 * groups that are hidden.
 */

type Parts<T extends HTMLElement> = ReadonlyArray<T> | undefined;

/** The rows a person can reach: no closed group holds them. */
export function visibleRows<Row extends HTMLElement>(
	rows: Parts<Row>,
	groups: Parts<HTMLElement>,
): Row[] {
	const closed = Array.from(groups ?? []).filter((group) => group.hasAttribute('hidden'));
	return Array.from(rows ?? []).filter((row) => !closed.some((group) => group.contains(row)));
}

/** Which row the event happened on: the DEEPEST holder, because rows nest. */
export function rowAt<Row extends HTMLElement>(rows: Parts<Row>, target: Node | null): Row | null {
	let found: Row | null = null;
	for (const row of rows ?? []) if (target !== null && row.contains(target)) found = row;
	return found;
}

/** The row one level up, or `null` at the top level. */
export function parentRow<Row extends HTMLElement>(rows: Parts<Row>, row: Row): Row | null {
	let found: Row | null = null;
	for (const one of rows ?? []) if (one !== row && one.contains(row)) found = one;
	return found;
}

/**
 * This row's OWN part, never a descendant row's: "first one inside" would follow
 * a child folder's trigger instead of this row's.
 */
export function ownPart<Part extends HTMLElement, Row extends HTMLElement>(
	parts: Parts<Part>,
	rows: Parts<Row>,
	row: Row,
): Part | null {
	for (const part of parts ?? [])
		if (row.contains(part) && rowAt(rows, part) === row) return part;
	return null;
}
