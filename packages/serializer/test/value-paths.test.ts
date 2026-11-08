import { expect, test } from 'vitest';
import { valueAlongPaths } from '../src/index.ts';

test('a plain object keeps only the fields the paths reach', () => {
	expect(
		valueAlongPaths({ name: 'ada', email: 'x', meta: { a: 1, b: 2 } }, [
			['name'],
			['meta', 'b'],
		]),
	).toEqual({
		name: 'ada',
		meta: { b: 2 },
	});
});

test('an array read for its length keeps its length, and an empty path keeps the value whole', () => {
	expect(valueAlongPaths(['a', 'b', 'c'], [['length']])).toEqual([null, null, null]);
	const whole = { tags: ['p'] };
	expect(valueAlongPaths(whole, [['tags'], []])).toBe(whole);
});

test('a built-in whose fields are not own data is kept whole', () => {
	const entries = new Map([['k', 1]]);
	const at = new Date(0);
	expect(valueAlongPaths(entries, [['size']])).toBe(entries);
	expect(valueAlongPaths(at, [['getTime']])).toBe(at);
	const nested = valueAlongPaths({ entries, other: 1 }, [['entries', 'size']]) as {
		readonly entries: Map<string, number>;
	};
	expect(nested).toEqual({ entries });
	expect(nested.entries.size).toBe(1);
});
