import { expect, test } from 'vitest';
import { nativeNonFiniteJoin, nativeNonFiniteSplit } from '../src/native-view.ts';

// JSON writes Infinity, -Infinity and NaN as null; a native payload and the phone's script bridge carry them beside the value.
test('a value with non-finite numbers crosses JSON and comes back whole, at the root, in objects and in arrays', () => {
	for (const value of [
		Infinity,
		Number.NaN,
		{ min: 40, max: Infinity, nested: { low: -Infinity, list: [1, Number.NaN, Infinity] } },
		[{ x: -Infinity }],
	]) {
		const { json, nonFinite } = nativeNonFiniteSplit(value);
		expect(nativeNonFiniteJoin(JSON.parse(JSON.stringify(json)), nonFinite)).toEqual(value);
	}
	expect(nativeNonFiniteSplit({ max: Infinity }).nonFinite).toEqual([[['max'], 'Infinity']]);
});

test('a value with none crosses as it is, with no list', () => {
	const value = { a: 1, b: [null, 'x'] };
	expect(nativeNonFiniteSplit(value)).toEqual({ json: value, nonFinite: [] });
	expect(nativeNonFiniteJoin(value, undefined)).toBe(value);
});
