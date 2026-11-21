import { describe, expect, it } from 'vitest';
import { nativeRangeValue } from '../src/native-view.ts';

describe("a range input's value, as HTML keeps it", () => {
	it.each([
		// value, min, max, step, what the browser's input.value reads
		[undefined, undefined, undefined, undefined, '50'],
		['abc', '0', '10', undefined, '5'],
		['7', '0', '10', undefined, '7'],
		['12', '0', '10', undefined, '10'],
		['-3', '0', '10', undefined, '0'],
		['7.4', '0', '10', undefined, '7'],
		['7.5', '0', '10', undefined, '8'],
		['9', '0', '10', '4', '8'],
		['10', '0', '10', '4', '8'],
		['0.3', '0', '1', '0.1', '0.3'],
		['0.25', '0', '1', '0.1', '0.3'],
		['0.333', '0', '1', 'any', '0.333'],
		['5', '10', '0', undefined, '10'],
		['0', '0', '0', undefined, '0'],
		['3', '1', '10', '2', '3'],
		['4', '1', '10', '2', '5'],
		['0.7', '0', '1', '0.2', '0.8'],
		['1e1', '0', '100', '3', '9'],
	])('%j in [%j, %j] by %j reads %j', (value, min, max, step, expected) => {
		expect(nativeRangeValue(value, min, max, step)).toBe(expected);
	});
});
