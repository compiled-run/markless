import { expect, test } from 'vitest';
import { deferredRuntimePacks } from '../src/build/deferred-runtime.ts';
import { isReExportDoor } from '../src/build/undemanded-runtime.ts';
import { planModulePreloadUrls } from '../src/build/preload-plan.ts';
import { marklessDeferredChunkFileNames } from '../src/build/route-pack-groups.ts';
import type { MarklessBundleGraph } from '../src/types.ts';

const web = (name: string) => `/repo/packages/web/src/${name}.ts`;

function modules(
	edges: Record<
		string,
		{ readonly static?: string[]; readonly dynamic?: string[]; readonly door?: boolean }
	>,
) {
	return new Map(
		Object.entries(edges).map(([id, edge]) => [
			id,
			{
				dependencies: edge.static ?? [],
				dynamicDependencies: edge.dynamic ?? [],
				reExportsOnly: edge.door,
			},
		]),
	);
}

test('only code reached solely through an undemanded import() is deferred, one pack per target', () => {
	const packs = deferredRuntimePacks({
		modules: modules({
			'/app/entry.ts': { static: [web('start')] },
			[web('start')]: {
				static: [web('shared')],
				dynamic: [web('async-wiring'), web('hold'), web('branches')],
			},
			[web('async-wiring')]: { static: [web('shared'), web('async-only')] },
			[web('hold')]: { static: [web('async-only')] },
			[web('async-only')]: {},
			[web('branches')]: { static: [web('shared')] },
			[web('shared')]: {},
		}),
		undemanded: new Set([web('async-wiring'), web('hold')]),
	});

	expect(Object.fromEntries(packs)).toEqual({
		[web('async-wiring')]: 'markless-deferred-web-async-wiring',
		[web('hold')]: 'markless-deferred-web-hold',
		[web('async-only')]: 'markless-deferred-web-async-wiring+web-hold',
	});
});

test('a target other code imports statically keeps its own pack, never its shared dependencies', () => {
	const packs = deferredRuntimePacks({
		modules: modules({
			'/app/entry.ts': { static: [web('start')], dynamic: [web('render')] },
			[web('start')]: { static: [web('shared')], dynamic: [web('sync-policy')] },
			[web('render')]: { static: [web('sync-policy')] },
			[web('sync-policy')]: { static: [web('shared')] },
			[web('shared')]: {},
		}),
		undemanded: new Set([web('sync-policy')]),
	});

	expect(Object.fromEntries(packs)).toEqual({
		[web('sync-policy')]: 'markless-deferred-web-sync-policy',
	});
});

test('a re-export door in front of undemanded runtime shares its pack, even when other code imports that runtime statically', () => {
	const packs = deferredRuntimePacks({
		modules: modules({
			'/app/entry.ts': { static: [web('start')], dynamic: [web('render')] },
			[web('start')]: { static: [web('shared')], dynamic: [web('policy-door')] },
			[web('policy-door')]: { static: [web('policy')], door: true },
			[web('render')]: { static: [web('policy')] },
			[web('policy')]: { static: [web('shared')] },
			[web('shared')]: {},
		}),
		undemanded: new Set([web('policy')]),
	});

	expect(Object.fromEntries(packs)).toEqual({
		[web('policy-door')]: 'markless-deferred-web-policy-door',
		[web('policy')]: 'markless-deferred-web-policy-door',
	});
});

test('a door in front of demanded runtime is never deferred', () => {
	const packs = deferredRuntimePacks({
		modules: modules({
			'/app/entry.ts': { static: [web('start')] },
			[web('start')]: { dynamic: [web('policy-door'), web('hold')] },
			[web('policy-door')]: { static: [web('policy')], door: true },
			[web('policy')]: {},
			[web('hold')]: {},
		}),
		undemanded: new Set([web('hold')]),
	});

	expect(Object.fromEntries(packs)).toEqual({ [web('hold')]: 'markless-deferred-web-hold' });
});

test('only a module whose source is export-star statements alone is a re-export door', () => {
	const door = (code: string, dynamic: string[] = []) =>
		isReExportDoor({ code, importedIds: [web('policy')], dynamicallyImportedIds: dynamic });
	expect(door("// door\nexport * from './policy.ts';\n")).toBe(true);
	expect(door('export * from "./a.ts"; export * from "./b.ts"')).toBe(true);
	expect(door("export * from './policy.ts';\nexport const extra = 1;")).toBe(false);
	expect(door("export { run } from './policy.ts';")).toBe(false);
	expect(door("export * from './policy.ts';", [web('other')])).toBe(false);
	expect(door('')).toBe(false);
});

test('a deferred pack and the facade in front of it are both lazy, and no preload plan follows them', () => {
	const chunks = [
		{ fileName: 'build/start.js', name: 'start', imports: [], moduleIds: [web('start')] },
		{
			fileName: 'build/wiring-facade.js',
			name: 'async-wiring',
			imports: ['build/wiring.js'],
			moduleIds: [],
		},
		{
			fileName: 'build/wiring.js',
			name: 'markless-deferred-web-async-wiring',
			imports: [],
			moduleIds: [web('async-wiring')],
		},
		{ fileName: 'build/empty.js', name: 'empty', imports: [], moduleIds: [] },
	];
	const lazy = marklessDeferredChunkFileNames(chunks);
	expect([...lazy].sort()).toEqual(['build/wiring-facade.js', 'build/wiring.js']);

	const bundleGraph: MarklessBundleGraph = [
		'start.js',
		-10,
		3,
		'wiring-facade.js',
		5,
		'wiring.js',
	];
	const roots = [{ name: 'start.js', edges: 'all' as const }];
	expect(planModulePreloadUrls({ bundleGraph, roots })).toEqual([
		'start.js',
		'wiring.js',
		'wiring-facade.js',
	]);
	expect(
		planModulePreloadUrls({
			bundleGraph,
			roots,
			lazyChunks: new Set([...lazy].map((name) => name.slice('build/'.length))),
		}),
	).toEqual(['start.js']);
});
