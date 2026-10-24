import { describe, expect, test } from 'vitest';
import {
	calleeOffsets,
	clearParsedChunkCode,
	mayContainDynamicImport,
	PARSED_CHUNK_CACHE_MAX_CODE_LENGTH,
	PARSED_CHUNK_CACHE_MAX_ENTRIES,
	parseChunkCode,
	spansAnyOffset,
	textOffsets,
} from '../src/build/chunk-ast.ts';

describe('chunk syntax trees shared across post-bundle passes', () => {
	test('hands every pass the same tree for the same code and a fresh tree once code changes', () => {
		clearParsedChunkCode();
		const code = 'export const a=1;';
		const first = parseChunkCode('a.js', code);
		expect(parseChunkCode('b.js', `${code}`)).toBe(first);
		expect(parseChunkCode('a.js', 'export const a=2;')).not.toBe(first);
		clearParsedChunkCode();
		expect(parseChunkCode('a.js', code)).not.toBe(first);
	});

	// Every chunk's tree, and each superseded version of it, stayed held until the next build started.
	test('drops a chunk tree its rewrite superseded, and parses past the cache budget uncached', () => {
		clearParsedChunkCode();
		const before = parseChunkCode('a.js', 'export const a=1;');
		parseChunkCode('a.js', 'export const a=2;');
		expect(parseChunkCode('b.js', 'export const a=1;')).not.toBe(before);

		clearParsedChunkCode();
		const half = 'x'.repeat(PARSED_CHUNK_CACHE_MAX_CODE_LENGTH / 2);
		const first = parseChunkCode('one.js', `export const a="${half}";`);
		const second = parseChunkCode('two.js', `export const b="${half}";`);
		expect(parseChunkCode('one.js', `export const a="${half}";`)).toBe(first);
		expect(parseChunkCode('two.js', `export const b="${half}";`)).not.toBe(second);
		clearParsedChunkCode();
	});

	// Thousands of tiny facade chunks fit the code budget, so the cache grew with page count.
	test('parses past a fixed number of cached trees uncached, however short their code', () => {
		clearParsedChunkCode();
		const trees = Array.from({ length: PARSED_CHUNK_CACHE_MAX_ENTRIES + 1 }, (_, index) =>
			parseChunkCode(`c${index}.js`, `export const v=${index};`),
		);
		expect(parseChunkCode('c0.js', 'export const v=0;')).toBe(trees[0]);
		const last = PARSED_CHUNK_CACHE_MAX_ENTRIES;
		expect(parseChunkCode(`c${last}.js`, `export const v=${last};`)).not.toBe(trees[last]);
		clearParsedChunkCode();
	});

	test('never shares a tree between file kinds that parse differently', () => {
		clearParsedChunkCode();
		const code = 'let a=<T,>(b:T)=>b;';
		expect(parseChunkCode('a.ts', code).errors).toHaveLength(0);
		expect(parseChunkCode('a.js', code).errors.length).toBeGreaterThan(0);
	});

	test('finds a dynamic import behind whitespace and comments', () => {
		expect(mayContainDynamicImport('import("./a.js")')).toBe(true);
		expect(mayContainDynamicImport('import /* lazy */ ("./a.js")')).toBe(true);
		expect(mayContainDynamicImport('import // lazy\n("./a.js")')).toBe(true);
		expect(mayContainDynamicImport('import ("./a.js")')).toBe(true);
	});

	test('rules out code whose only imports are static or import.meta', () => {
		expect(mayContainDynamicImport('import{a}from"./a.js";a(import.meta.url)')).toBe(false);
		expect(mayContainDynamicImport('import // ("./a.js")\n.meta')).toBe(false);
		expect(mayContainDynamicImport('const a=1;')).toBe(false);
	});

	test('finds every spot a name may be called from, but not inside longer names', () => {
		const code = 'e(1);ee(2);e /* c */ (3);e?.(4);new e;e$(5);x.e\n(6);e=1';
		expect(calleeOffsets(code, 'e').map((offset) => code.slice(offset, offset + 3))).toEqual([
			'e(1',
			'e /',
			'e?.',
			'e\n(',
		]);
	});

	test('keeps a subtree only when its source range holds a match', () => {
		const offsets = textOffsets('a;import("x");b;import("y")', 'import');
		expect(offsets).toEqual([2, 16]);
		expect(spansAnyOffset(offsets, { start: 0, end: 2 })).toBe(false);
		expect(spansAnyOffset(offsets, { start: 2, end: 13 })).toBe(true);
		expect(spansAnyOffset(offsets, { start: 13, end: 16 })).toBe(false);
		expect(spansAnyOffset(offsets, { start: 15, end: 30 })).toBe(true);
		expect(spansAnyOffset(offsets, {})).toBe(true);
	});
});
