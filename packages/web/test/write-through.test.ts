import { expect, test } from 'vitest';
import { marklessElementPath, marklessWriteThrough } from '../src/fns/write-through.ts';

function graphOver(root: Record<string, unknown>) {
	const writes: Array<{ graphNodeId: string; path?: ReadonlyArray<string>; value: unknown }> = [];
	const read = (graphNodeId: string, path: ReadonlyArray<string> = []) =>
		path.reduce<unknown>(
			(value, segment) =>
				value == null ? undefined : (value as Record<string, unknown>)[segment],
			root[graphNodeId],
		);
	const graph = {
		read,
		write: (write: (typeof writes)[number]) => writes.push(write),
		update: () => undefined,
		call: () => undefined,
		delete: () => true,
	};
	return { context: { graph }, writes };
}

test('a seat inside a row is written at its path through the row', () => {
	const seat = { picked: false };
	const row = { seats: [{ picked: false }, seat] };
	const { context, writes } = graphOver({ 'state:rows': [{ seats: [] }, row] });
	const base = marklessElementPath(context, 'state:rows', [], row, ['seats']);
	marklessWriteThrough(context, 'state:rows', base, seat, true).write({
		graphNodeId: 'state:rows',
		path: ['picked'],
		value: true,
	});
	expect(base).toEqual(['1', 'seats']);
	expect(writes).toEqual([
		{ graphNodeId: 'state:rows', path: ['1', 'seats', '1', 'picked'], value: true },
	]);
	expect(seat.picked).toBe(false);
});

test('a row that has left the list makes the write a plain one on the objects the handler holds', () => {
	const seat = { picked: false };
	const row = { seats: [seat] };
	const { context, writes } = graphOver({ 'state:rows': [] });
	const base = marklessElementPath(context, 'state:rows', [], row, ['seats']);
	marklessWriteThrough(context, 'state:rows', base, seat, true).write({
		graphNodeId: 'state:rows',
		path: ['picked'],
		value: true,
	});
	expect(base).toBeNull();
	expect(writes).toEqual([]);
	expect(seat.picked).toBe(true);
});

test('a list path that holds something other than a list throws a named error instead of writing', () => {
	const tag = { on: false };
	const row = { tags: new Set([tag]) };
	const { context, writes } = graphOver({ 'state:rows': [row] });
	const base = marklessElementPath(context, 'state:rows', [], row, ['tags']);
	expect(() => marklessWriteThrough(context, 'state:rows', base, tag, true)).toThrow(
		expect.objectContaining({ code: 'MARKLESS_WRITE_THROUGH_NOT_A_LIST' }),
	);
	expect(writes).toEqual([]);
	expect(tag.on).toBe(false);
});
