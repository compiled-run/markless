import { expect, test } from 'vitest';
import {
	emitSymbolBundleModule,
	planSymbolBundles,
	symbolBundleVirtualModuleId,
	symbolBundleVirtualModuleSourceFile,
} from '../src/build/symbol-bundles.ts';

const symbol = (id: string) => ({ symbolId: id, moduleId: `module:${id}` });

test('symbols woken by the same interaction set share one bundle', () => {
	const bundles = planSymbolBundles({
		filename: '/src/root.tsrx',
		symbols: [symbol('a'), symbol('b'), symbol('c')],
		interactions: [
			{ id: 'play:click', symbolIds: ['a', 'b'] },
			{ id: 'next:click', symbolIds: ['c'] },
		],
	});

	expect(bundles).toHaveLength(1);
	expect(bundles[0]!.key).toBe('play:click');
	expect(bundles[0]!.symbolModuleIds).toEqual(['module:a', 'module:b']);
});

test('a symbol two interactions wake never joins either interaction bundle', () => {
	const bundles = planSymbolBundles({
		filename: '/src/root.tsrx',
		symbols: [symbol('a'), symbol('b'), symbol('shared'), symbol('c'), symbol('d')],
		interactions: [
			{ id: 'play:click', symbolIds: ['a', 'b', 'shared'] },
			{ id: 'next:click', symbolIds: ['c', 'd', 'shared'] },
		],
	});

	const members = bundles.flatMap((bundle) => [...bundle.symbolModuleIds]);
	expect(members).not.toContain('module:shared');
	expect(bundles.map((bundle) => [...bundle.symbolModuleIds])).toEqual([
		['module:c', 'module:d'],
		['module:a', 'module:b'],
	]);
});

// The interaction view a caller passes is one module's local trigger groups: it
// cannot name a symbol whose waking host node lives in a child module (a
// callback prop) or whose waking write is any of several interactions (a
// dom-update). Unnamed therefore means "owner unknown", and grouping unknowns
// together made one click execute every other interaction's handler.
test('symbols the interaction view does not name are never grouped together', () => {
	const bundles = planSymbolBundles({
		filename: '/src/root.tsrx',
		symbols: [symbol('a'), symbol('unnamed1'), symbol('unnamed2')],
		interactions: [{ id: 'play:click', symbolIds: ['a'] }],
	});

	expect(bundles).toEqual([]);
});

test('a page whose handlers cross component edges keeps one chunk per handler', () => {
	// Shape of the music-player page: two own-host handlers plus a behavior the
	// local groups name, and callback props / dom-updates they cannot name.
	const bundles = planSymbolBundles({
		filename: '/pages/index.tsrx',
		symbols: [
			symbol('sym:0'),
			symbol('sym:1'),
			...['sym:2', 'sym:3', 'sym:4', 'sym:5', 'sym:6', 'sym:7', 'sym:8', 'sym:9'].map(symbol),
			symbol('sym:10'),
			symbol('sym:11'),
		],
		interactions: [
			{ id: 'h2:click', symbolIds: ['sym:0', 'sym:11'] },
			{ id: 'h3:click', symbolIds: ['sym:1', 'sym:11'] },
		],
	});

	expect(bundles).toEqual([]);
});

test('an alternate-shaped module bundles only the symbols one interaction claims', () => {
	const bundles = planSymbolBundles({
		filename: '/widgets/Panel.tsrx',
		symbols: [
			symbol('fn/toggle'),
			symbol('fn/paint'),
			symbol('fn/detached-a'),
			symbol('fn/detached-b'),
			symbol('fn/detached-c'),
		],
		interactions: [{ id: 'node7:pointerdown', symbolIds: ['fn/toggle', 'fn/paint'] }],
	});

	expect(bundles).toHaveLength(1);
	expect(bundles[0]!.key).toBe('node7:pointerdown');
	expect(bundles[0]!.symbolModuleIds).toEqual(['module:fn/paint', 'module:fn/toggle']);
});

test('a lone symbol keeps its own module rather than gaining a re-export hop', () => {
	const bundles = planSymbolBundles({
		filename: '/src/root.tsrx',
		symbols: [symbol('a'), symbol('b')],
		interactions: [
			{ id: 'play:click', symbolIds: ['a'] },
			{ id: 'next:click', symbolIds: ['b'] },
		],
	});

	expect(bundles).toEqual([]);
});

test('bundle ids and module sources are stable for the same plan', () => {
	const plan = () =>
		planSymbolBundles({
			filename: '/src/root.tsrx',
			symbols: [symbol('b'), symbol('a')],
			interactions: [{ id: 'play:click', symbolIds: ['a', 'b'] }],
		});

	expect(plan()).toEqual(plan());
	expect(plan()[0]!.id).toBe(symbolBundleVirtualModuleId('/src/root.tsrx', 0));
	expect(emitSymbolBundleModule(plan()[0]!.symbolModuleIds)).toBe(
		'export * from "module:a";\nexport * from "module:b";\n',
	);
});

test('symbolBundleVirtualModuleSourceFile reads back the source file the id carries', () => {
	const id = symbolBundleVirtualModuleId('/src/pages/index.tsrx', 3);

	expect(symbolBundleVirtualModuleSourceFile(id)).toBe('/src/pages/index.tsrx');
	expect(symbolBundleVirtualModuleSourceFile(`\0${id}`)).toBe('/src/pages/index.tsrx');
	expect(symbolBundleVirtualModuleSourceFile('virtual:markless:symbol:/src/root.tsrx:0')).toBe(
		null,
	);
	expect(symbolBundleVirtualModuleSourceFile('virtual:markless:symbol-bundle:x')).toBe(null);
});
