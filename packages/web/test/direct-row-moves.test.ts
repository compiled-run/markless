import { expect, test } from 'vitest';
import { replaceMarklessPublicRows } from '../src/fns/direct.ts';

class Row {
	parentNode: Parent | null = null;
	constructor(readonly key: string) {}
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
