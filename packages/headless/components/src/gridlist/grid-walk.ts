/**
 * The grid's own parts, handed in as `element<T[]>()` members, answer every
 * question the root's keyboard would otherwise ask the DOM: members come back
 * live and in document order.
 *
 * The move itself is geometric rather than ordinal, which is what lets one
 * engine serve both a one-column stack and a wrapping card gallery without a
 * layout prop: a row's neighbour in a direction is the nearest box whose centre
 * lines up within a tolerance, and document order is only what remains when
 * nothing lines up at all.
 */

type Parts<T extends HTMLElement> = ReadonlyArray<T> | undefined;

export type Direction = 'up' | 'down' | 'left' | 'right';

/** How far two centres may sit apart and still count as one column or one row. */
export const TOLERANCE_PX = 16;

/** Which row the event happened on. Rows do not nest, so the first holder is it. */
export function rowAt<Row extends HTMLElement>(rows: Parts<Row>, target: Node | null): Row | null {
	if (target === null) return null;
	for (const row of rows ?? []) if (row.contains(target)) return row;
	return null;
}

/** The rows a person can reach: the walk steps over the ones marked unavailable. */
export function reachableRows<Row extends HTMLElement>(rows: Parts<Row>): Row[] {
	const open: Row[] = [];
	for (const row of rows ?? []) if (!row.hasAttribute('ui-disabled')) open.push(row);
	return open;
}

/** The parts this row holds, in document order. */
export function ownParts<Part extends HTMLElement, Row extends HTMLElement>(
	parts: Parts<Part>,
	row: Row,
): Part[] {
	const mine: Part[] = [];
	for (const part of parts ?? []) if (row.contains(part)) mine.push(part);
	return mine;
}

/** Whether a node the platform handed over sits inside one of this row's parts. */
export function heldBy<Part extends HTMLElement>(parts: readonly Part[], node: Node): boolean {
	for (const part of parts) if (part.contains(node)) return true;
	return false;
}

/** Each row's identity, as the row itself carries it. */
export function rowValues<Row extends HTMLElement>(rows: readonly Row[]): string[] {
	const values: string[] = [];
	for (const row of rows) values.push(row.getAttribute('ui-value') ?? '');
	return values;
}

/**
 * The words a typeahead matches against: the row's own label part when it has
 * one, and everything the row reads otherwise.
 */
export function rowLabels<Row extends HTMLElement, Part extends HTMLElement>(
	rows: readonly Row[],
	labels: Parts<Part>,
): string[] {
	const words: string[] = [];
	for (const row of rows) {
		const own = ownParts(labels, row)[0];
		const text = (own ? own.textContent : row.textContent) ?? '';
		words.push(text.trim().toLowerCase());
	}
	return words;
}

function centreX(box: DOMRect): number {
	return box.left + box.width / 2;
}

function centreY(box: DOMRect): number {
	return box.top + box.height / 2;
}

/**
 * The row a direction lands on.
 *
 * Three passes, in order of how much they claim to know. A box whose centre is
 * within `TOLERANCE_PX` of this one on the cross axis is in the same column (or
 * row) and the nearest such box wins. Failing that, the nearest box anywhere on
 * that side wins, which is what carries a gallery whose last visual row is
 * short. Failing that - every centre identical, as in a document that has not
 * been laid out - document order is the answer, and `wrap` decides what happens
 * at the ends.
 */
export function spatialMove<Row extends HTMLElement>(
	rows: readonly Row[],
	from: Row,
	direction: Direction,
	wrap: boolean,
): Row | null {
	const at = rows.indexOf(from);
	if (at < 0) return null;

	const vertical = direction === 'up' || direction === 'down';
	const forward = direction === 'down' || direction === 'right';
	const box = from.getBoundingClientRect();
	const hereAlong = vertical ? centreY(box) : centreX(box);
	const hereAcross = vertical ? centreX(box) : centreY(box);

	let aligned: Row | null = null;
	let alignedReach = Number.POSITIVE_INFINITY;
	let nearest: Row | null = null;
	let nearestCost = Number.POSITIVE_INFINITY;

	for (const row of rows) {
		if (row === from) continue;
		const there = row.getBoundingClientRect();
		const along = (vertical ? centreY(there) : centreX(there)) - hereAlong;
		const across = (vertical ? centreX(there) : centreY(there)) - hereAcross;
		if (forward ? along <= 0 : along >= 0) continue;

		const reach = Math.abs(along);
		const drift = Math.abs(across);
		if (drift <= TOLERANCE_PX && reach < alignedReach) {
			aligned = row;
			alignedReach = reach;
		}
		const cost = reach * reach + drift * drift;
		if (cost < nearestCost) {
			nearest = row;
			nearestCost = cost;
		}
	}

	if (aligned !== null) return aligned;
	if (nearest !== null) return nearest;

	const step = rows[forward ? at + 1 : at - 1];
	if (step !== undefined) return step;
	if (!wrap) return null;
	return (forward ? rows[0] : rows[rows.length - 1]) ?? null;
}
