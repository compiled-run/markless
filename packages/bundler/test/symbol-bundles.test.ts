import { expect, test } from 'vitest';
import {
	emitSymbolBundleModule,
	planSymbolBundles,
	symbolBundleVirtualModuleId,
	symbolBundleVirtualModuleSourceFile,
	SYMBOL_BUNDLE_BOOT_KEY,
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

test('symbols no interaction wakes form the boot bundle', () => {
	const bundles = planSymbolBundles({
		filename: '/src/root.tsrx',
		symbols: [symbol('a'), symbol('boot1'), symbol('boot2')],
		interactions: [{ id: 'play:click', symbolIds: ['a'] }],
	});

	expect(bundles).toHaveLength(1);
	expect(bundles[0]!.key).toBe(SYMBOL_BUNDLE_BOOT_KEY);
	expect(bundles[0]!.symbolModuleIds).toEqual(['module:boot1', 'module:boot2']);
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
