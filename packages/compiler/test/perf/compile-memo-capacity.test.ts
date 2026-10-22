import { expect, test } from 'vitest';
import type { CompileTsrxModuleResult } from '../../src/artifacts.ts';
import { clearCompileCache, memoizedCompile } from '../../src/compile-cache.ts';

// A build asks for each module's compile again from its other environment and from every importer's interface
// read; with room for only 512 compiles, a 123-page app re-ran 5,203 of 8,160 compiles that had been evicted.
test('a few thousand modules stay memoized across one build', async () => {
	clearCompileCache();
	let compiles = 0;
	const compile = () => {
		compiles++;
		return Promise.resolve({} as CompileTsrxModuleResult);
	};
	const input = (index: number) => ({
		filename: `src/M${index}.tsrx`,
		source: `export const value = ${index};`,
		symbols: [],
	});
	for (let index = 0; index < 4_000; index++) await memoizedCompile(input(index), compile);
	expect(compiles).toBe(4_000);
	for (let index = 0; index < 4_000; index++) await memoizedCompile(input(index), compile);
	expect(compiles).toBe(4_000);
	clearCompileCache();
});
