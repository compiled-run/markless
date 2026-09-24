import { expect, test } from 'vitest';
import { executedSourceRanges } from './coverage-ranges.ts';

test('coverage excludes untouched function bodies within an evaluated script', () => {
	expect(executedSourceRanges([
		{ startOffset: 0, endOffset: 100, count: 1 },
		{ startOffset: 10, endOffset: 90, count: 0 },
		{ startOffset: 20, endOffset: 30, count: 1 },
	])).toEqual([{ start: 0, end: 10 }, { start: 20, end: 30 }, { start: 90, end: 100 }]);
});

test('later calls count their executed regions without recharging the script', () => {
	expect(executedSourceRanges([
		{ startOffset: 25, endOffset: 30, count: 0 },
		{ startOffset: 0, endOffset: 100, count: 0 },
		{ startOffset: 10, endOffset: 20, count: 1 },
		{ startOffset: 20, endOffset: 40, count: 2 },
	])).toEqual([{ start: 10, end: 25 }, { start: 30, end: 40 }]);
	expect(executedSourceRanges([])).toEqual([]);
});
