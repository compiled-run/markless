/**
 * The second axis, over the same registered handles `gridlist` walks.
 *
 * A table's move is ordinal rather than geometric: `<tr>` and `<td>` are laid
 * out by the table algorithm, so the row after this one is the row written after
 * it and the column a cell sits in is its place among its own row's cells. That
 * is the whole coordinate system, and it means no part is ever told a number.
 *
 * `rowAt`, `ownParts` and `reachableRows` are `gridlist`'s and are imported
 * rather than copied: they are plain functions over registered handles with no
 * graph in them, which is what makes sharing them a move rather than a fork.
 */

import { ownParts, reachableRows } from '../gridlist/grid-walk.ts';

type Parts<T extends HTMLElement> = ReadonlyArray<T> | undefined;

/**
 * Every cell a person can reach, in document order: the cells of the rows the
 * walk does not step over. This is the roster the roving stop is written across.
 */
export function reachableCells<Row extends HTMLElement, Cell extends HTMLElement>(
	rows: Parts<Row>,
	cells: Parts<Cell>,
): Cell[] {
	const open: Cell[] = [];
	for (const row of reachableRows(rows)) for (const cell of ownParts(cells, row)) open.push(cell);
	return open;
}

/**
 * The cell a vertical move lands on: the same column in another row, held to
 * that row's own ends. A short row keeps the move rather than swallowing it,
 * which is what a person expects from a table with a merged cell in it.
 */
export function cellAt<Row extends HTMLElement, Cell extends HTMLElement>(
	cells: Parts<Cell>,
	row: Row | undefined,
	column: number,
): Cell | null {
	if (row === undefined) return null;
	const mine = ownParts(cells, row);
	if (mine.length === 0) return null;
	const at = column < 0 ? 0 : column > mine.length - 1 ? mine.length - 1 : column;
	return mine[at] ?? null;
}

/** The words a typeahead matches: everything the row reads, which is its cells. */
export function rowText<Row extends HTMLElement>(rows: readonly Row[]): string[] {
	const words: string[] = [];
	for (const row of rows) words.push((row.textContent ?? '').trim().toLowerCase());
	return words;
}
