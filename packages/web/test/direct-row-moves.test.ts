import { expect, test } from 'vitest';
import { replaceMarklessPublicRows } from '../src/fns/direct.ts';

class Row {
	parentNode: Parent | null = null;
	constructor(readonly key: string) {}
	get parentElement(): Parent | null {
		return this.parentNode;
	}
	get nextSibling(): Row | null {
		const siblings = this.parentNode?.childNodes ?? [];
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}
}
class Parent {
	childNodes: Row[] = [];
	moves: string[] = [];
	get firstChild(): Row | null {
		return this.childNodes[0] ?? null;
	}
	insertBefore(row: Row, before: Row | null) {
		this.detach(row);
		const at = before ? this.childNodes.indexOf(before) : this.childNodes.length;
		this.childNodes.splice(at, 0, row);
		row.parentNode = this;
		this.moves.push(`insert ${row.key}`);
	}
	removeChild(row: Row) {
		this.detach(row);
		this.moves.push(`remove ${row.key}`);
	}
	replaceChildren(fragment: Fragment) {
		for (const row of this.childNodes.slice()) this.removeChild(row);
		for (const row of fragment.rows) this.insertBefore(row, null);
	}
	detach(row: Row) {
		const at = this.childNodes.indexOf(row);
		if (at >= 0) this.childNodes.splice(at, 1);
		row.parentNode = null;
	}
}

class Fragment {
	rows: Row[] = [];
	appendChild(row: Row) {
		if (row.parentNode) row.parentNode.removeChild(row);
		this.rows.push(row);
	}
}
(globalThis as { document?: unknown }).document ??= {
	createDocumentFragment: () => new Fragment(),
};

function rowsOf(keys: string[]) {
	const parent = new Parent();
	const rows = new Map(keys.map((key) => [key, { root: new Row(key) }]));
	for (const { root } of rows.values()) parent.insertBefore(root, null);
	parent.moves = [];
	return { parent, rows };
}

test('a shifted keyed window moves only the rows that leave and arrive', () => {
	const { parent, rows } = rowsOf(['a', 'b', 'c', 'd', 'e']);
	for (const key of ['f', 'g']) rows.set(key, { root: new Row(key) });
	const state = { rows, keys: ['a', 'b', 'c', 'd', 'e'] } as never;
	const focused = rows.get('c')!.root;
	replaceMarklessPublicRows(parent as never, state, ['c', 'd', 'e', 'f', 'g']);
	expect(parent.childNodes.map((row) => row.key)).toEqual(['c', 'd', 'e', 'f', 'g']);
	expect(parent.moves.sort()).toEqual(['insert f', 'insert g', 'remove a', 'remove b']);
	expect(focused.parentNode).toBe(parent);
});

test('a reversed keyed list still ends in key order', () => {
	const { parent, rows } = rowsOf(['a', 'b', 'c', 'd']);
	replaceMarklessPublicRows(parent as never, { rows, keys: ['a', 'b', 'c', 'd'] } as never, [
		'd',
		'c',
		'b',
		'a',
	]);
	expect(parent.childNodes.map((row) => row.key)).toEqual(['d', 'c', 'b', 'a']);
	expect(parent.moves.some((move) => move.startsWith('remove'))).toBe(false);
});

function longestIncreasingLength(values: number[]) {
	const tails: number[] = [];
	for (const value of values) {
		let low = 0;
		let high = tails.length;
		while (low < high) {
			const middle = (low + high) >> 1;
			if (tails[middle]! < value) low = middle + 1;
			else high = middle;
		}
		tails[low] = value;
	}
	return tails.length;
}

test('moving the last row to the front moves one row', () => {
	const keys = Array.from({ length: 50 }, (_, index) => `k${index}`);
	const { parent, rows } = rowsOf(keys);
	const next = [keys[49]!, ...keys.slice(0, 49)];
	replaceMarklessPublicRows(parent as never, { rows, keys } as never, next);
	expect(parent.childNodes.map((row) => row.key)).toEqual(next);
	expect(parent.moves).toEqual(['insert k49']);
});

test('two swapped rows move two rows and one removed row moves none', () => {
	const keys = Array.from({ length: 20 }, (_, index) => `k${index}`);
	const swapped = rowsOf(keys);
	const next = keys.slice();
	[next[1], next[18]] = [next[18]!, next[1]!];
	replaceMarklessPublicRows(swapped.parent as never, { rows: swapped.rows, keys } as never, next);
	expect(swapped.parent.childNodes.map((row) => row.key)).toEqual(next);
	expect(swapped.parent.moves).toHaveLength(2);

	const removed = rowsOf(keys);
	const fewer = keys.filter((key) => key !== 'k7');
	replaceMarklessPublicRows(removed.parent as never, { rows: removed.rows, keys } as never, fewer);
	expect(removed.parent.childNodes.map((row) => row.key)).toEqual(fewer);
	expect(removed.parent.moves).toEqual(['remove k7']);
});

test('any reorder moves only the rows outside the longest run already in order', () => {
	let seed = 11;
	const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	for (let run = 0; run < 40; run++) {
		const keys = Array.from({ length: 30 }, (_, index) => `k${index}`);
		const { parent, rows } = rowsOf(keys);
		const kept = keys.filter(() => random() > 0.2);
		const added = Array.from({ length: Math.floor(random() * 5) }, (_, index) => `n${run}-${index}`);
		for (const key of added) rows.set(key, { root: new Row(key) });
		const next = [...kept, ...added].sort(() => random() - 0.5);
		replaceMarklessPublicRows(parent as never, { rows, keys } as never, next);
		expect(parent.childNodes.map((row) => row.key)).toEqual(next);
		const inPlace = longestIncreasingLength(
			next.filter((key) => keys.includes(key)).map((key) => keys.indexOf(key)),
		);
		expect(parent.moves.filter((move) => move.startsWith('insert'))).toHaveLength(
			next.length - inPlace,
		);
	}
});
