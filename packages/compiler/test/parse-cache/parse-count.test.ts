import { expect, test } from 'vitest';
import { compileTsrxModule } from '../../src/compile-module.ts';
import { parseCacheStats, parseModule, resetParseCache } from '../../src/js-ast.ts';
import { COMPILING_FIXTURES } from './fixtures.ts';

/**
 * Parses of the module's own source, not of the code the emitters generate:
 * generated code goes through `parseJavaScriptModule`, which is never memoized
 * because its callers rewrite the tree they get back.
 */
async function compile(index: number): Promise<void> {
	const fixture = COMPILING_FIXTURES[index]!;
	await compileTsrxModule({
		filename: fixture.filename,
		source: fixture.source,
		symbols: [],
		importedModuleInterfaces: {},
	});
}

test('a whole compile parses the module source once, however many passes ask', async () => {
	resetParseCache();

	await compile(0);

	const stats = parseCacheStats();
	expect(stats.misses).toBe(1);
	expect(stats.hits).toBeGreaterThan(0);
});

test('compiling the same source again parses nothing', async () => {
	resetParseCache();

	await compile(1);
	const first = parseCacheStats();
	await compile(1);
	const second = parseCacheStats();

	expect(first.misses).toBe(1);
	expect(second.misses).toBe(first.misses);
	expect(second.hits).toBe(first.hits);
});

test('the same text under a different filename is a different module', () => {
	resetParseCache();
	const source = `export function App() @{ <main>ok</main> }`;

	const left = parseModule(source, 'src/ParseCacheLeft.tsrx');
	const right = parseModule(source, 'src/ParseCacheRight.tsrx');

	expect(right).not.toBe(left);
	expect(parseCacheStats().misses).toBe(2);
});

test('the memo is bounded, and evicting an entry costs one reparse', () => {
	resetParseCache();
	const oldest = `export function App0() @{ <main>0</main> }`;

	const first = parseModule(oldest, 'src/ParseCacheBounded.tsrx');
	expect(parseModule(oldest, 'src/ParseCacheBounded.tsrx')).toBe(first);

	for (let index = 1; index <= 256; index += 1) {
		parseModule(`export function App${index}() @{ <main>${index}</main> }`, `src/B${index}.tsrx`);
	}

	expect(parseCacheStats().size).toBe(256);
	expect(parseModule(oldest, 'src/ParseCacheBounded.tsrx')).not.toBe(first);
});

test('a parse failure is not memoized', () => {
	resetParseCache();
	const broken = `export function App( @{ <main>`;

	expect(() => parseModule(broken, 'src/ParseCacheBroken.tsrx')).toThrow();
	expect(() => parseModule(broken, 'src/ParseCacheBroken.tsrx')).toThrow();
	expect(parseCacheStats().size).toBe(0);
});
