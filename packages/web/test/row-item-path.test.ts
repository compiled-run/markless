import { expect, test } from 'vitest';
import { marklessRowItemPath } from '../src/fns/row-item-path.ts';

function contextOver(list: unknown[], item: unknown) {
	return {
		graph: {
			read: (_id: string, path: ReadonlyArray<string> = []) =>
				path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], {
					items: list,
				}),
		},
		locals: { entry: item },
	};
}

test('finds the row element by identity, then by key after the list reordered', () => {
	const first = { id: 'x' };
	const second = { id: 'y' };
	const list = [first, second];
	expect(
		marklessRowItemPath(contextOver(list, second), 'n', ['items'], 'entry', ['id'], ['v']),
	).toEqual(['items', '1', 'v']);
	list.reverse();
	expect(
		marklessRowItemPath(contextOver(list, { id: 'y' }), 'n', ['items'], 'entry', ['id'], ['v']),
	).toEqual(['items', '0', 'v']);
});

test('a row keyed by position finds its element by identity only', () => {
	const item = { v: 1 };
	expect(
		marklessRowItemPath(contextOver([{ v: 0 }, item], item), 'n', ['items'], 'entry', null, []),
	).toEqual(['items', '1']);
});

test('an item no longer in the list throws a coded error instead of writing a stray index', () => {
	expect(() =>
		marklessRowItemPath(
			contextOver([{ id: 'x' }], { id: 'gone' }),
			'n',
			['items'],
			'entry',
			['id'],
			['v'],
		),
	).toThrow(expect.objectContaining({ code: 'MARKLESS_ROW_ITEM_MISSING' }));
});

test('a nested row finds its element inside the enclosing row found the same way', () => {
	const inner = { id: 'b' };
	const groups = [
		{ id: 'g1', items: [{ id: 'a' }] },
		{ id: 'g2', items: [{ id: 'a' }, inner] },
	];
	const context = {
		graph: {
			read: (_id: string, path: ReadonlyArray<string> = []) =>
				path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], groups),
		},
		locals: { group: groups[1], item: inner },
	};
	const enclosing = marklessRowItemPath(context, 'n', [], 'group', ['id'], ['items']);
	expect(marklessRowItemPath(context, 'n', enclosing, 'item', ['id'], ['hits'])).toEqual([
		'1',
		'items',
		'1',
		'hits',
	]);
});
