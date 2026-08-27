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
	const closed: HTMLElement[] = [];
	for (const group of groups ?? []) if (group.hasAttribute('hidden')) closed.push(group);

	const visible: Row[] = [];
	for (const row of rows ?? []) {
		let isHidden = false;
		for (const group of closed)
			if (group.contains(row)) {
				isHidden = true;
				break;
			}
		if (!isHidden) visible.push(row);
	}
	return visible;
}

/** Which row the event happened on: the DEEPEST holder, because rows nest. */
export function rowAt<Row extends HTMLElement>(rows: Parts<Row>, target: Node | null): Row | null {
	if (target === null) return null;
	let found: Row | null = null;
	for (const row of rows ?? []) if (row.contains(target)) found = row;
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
