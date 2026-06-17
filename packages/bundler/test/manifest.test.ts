import { describe, expect, test } from 'vitest';
import {
	convertManifestToBundleGraph,
	createPreloadGraphAdder,
} from '../src/build/bundle-graph.ts';
import { ARCADE_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import {
	ARCADE_MANIFEST,
	createManifest,
	injectManifest,
	type ArcadeManifestBundle,
} from '../src/build/manifest.ts';
import type { ArcadeManifest, ArcadeTransformManifest } from '../src/types.ts';

const transformManifest: ArcadeTransformManifest = {
	source: '/workspace/app/src/root.tsrx',
	payload: { virtualModuleId: 'virtual:arcade:payload:root' },
	resolver: { virtualModuleId: 'virtual:arcade:resolver:root' },
	symbols: [
		{
			symbolId: 'root#click',
			kind: 'event-handler',
			exportName: 'onClick',
			virtualModuleId: 'virtual:arcade:symbol:root:click',
		},
	],
};

describe('arcade manifest output', () => {
	test('creates a manifest from bundler output and transform artifacts', () => {
		const manifest = createManifest(
			{
				'build/chunk-entry.js': chunk({
					fileName: 'build/chunk-entry.js',
					name: 'entry',
					code: 'import "./chunk-symbol.js"; export default {};',
					imports: ['build/chunk-symbol.js'],
					moduleIds: ['/workspace/app/src/root.tsrx'],
					facadeModuleId: '/workspace/app/src/root.tsrx',
				}),
				'build/chunk-symbol.js': chunk({
					fileName: 'build/chunk-symbol.js',
					name: 'root_click',
					code: 'export const onClick = () => {};',
					moduleIds: ['\0virtual:arcade:symbol:root:click'],
					facadeModuleId: '\0virtual:arcade:symbol:root:click',
				}),
				'build/root.css': {
					type: 'asset',
					fileName: 'build/root.css',
					name: 'root.css',
					names: ['root.css'],
					source: 'body{}',
				},
				'build/chunk-entry.js.map': {
					type: 'asset',
					fileName: 'build/chunk-entry.js.map',
					name: 'chunk-entry.js.map',
					names: ['chunk-entry.js.map'],
					source: '{}',
				},
			},
			[transformManifest],
			'/workspace/app',
			{
				bundleGraphAsset: ARCADE_BUNDLE_GRAPH,
				publicPath: (fileName) => `/assets/${fileName}`,
			},
		);

		expect(manifest.modules[0]).toMatchObject({
			source: '/workspace/app/src/root.tsrx',
			symbols: [
				expect.objectContaining({
					symbolId: 'root#click',
					fileName: 'build/chunk-symbol.js',
				}),
			],
		});
		expect(manifest.bundles['build/chunk-entry.js']).toMatchObject({
			imports: ['build/chunk-symbol.js'],
			origins: ['src/root.tsrx'],
		});
		expect(manifest.bundles['build/chunk-symbol.js']).toMatchObject({
			symbols: ['root#click'],
		});
		expect(manifest.assets?.['build/root.css']).toEqual({ name: 'root.css', size: 6 });
		expect(manifest.assets?.['build/chunk-entry.js.map']).toBeUndefined();
		expect(manifest.bundleGraphAsset).toBe(ARCADE_BUNDLE_GRAPH);
		expect(manifest.bundleGraph).toContain('root#click');
		expect(manifest.injections).toContainEqual({
			tag: 'link',
			location: 'head',
			attributes: {
				rel: 'stylesheet',
				href: '/assets/build/root.css',
			},
		});
		expect(manifest.manifestHash).toEqual(expect.any(String));
	});

	test('converts symbol and custom preload entries into the bundle graph', () => {
		const manifest: ArcadeManifest = {
			version: 1,
			manifestHash: 'test',
			modules: [
				{
					...transformManifest,
					symbols: [
						{
							...transformManifest.symbols[0]!,
							fileName: 'build/chunk-symbol.js',
						},
					],
				},
			],
			bundles: {
				'build/chunk-entry.js': {
					size: 100,
					total: 200,
					dynamicImports: ['build/chunk-symbol.js'],
					origins: ['src/root.tsrx'],
				},
				'build/chunk-symbol.js': {
					size: 50,
					total: 50,
					symbols: ['root#click'],
					origins: ['src/root.tsrx'],
				},
			},
		};
		const adders = new Set([
			createPreloadGraphAdder(({ bundlesForOrigins }) => ({
				'entry-preload': {
					dynamicImports: bundlesForOrigins(['/src/root.tsrx']),
				},
			})),
		]);

		const graph = convertManifestToBundleGraph(manifest, adders);

		expect(graph).toContain('root#click');
		expect(graph).toContain('entry-preload');
		expect(graph).toContain('build/chunk-symbol.js');
	});

	test('injects only server-needed build manifest fields into server output', () => {
		const manifest: ArcadeManifest = {
			version: 1,
			manifestHash: 'abc',
			modules: [transformManifest],
			bundles: {},
			bundleGraph: ['root#click'],
			bundleGraphAsset: ARCADE_BUNDLE_GRAPH,
			injections: [{ tag: 'script', location: 'head', attributes: { src: '/runtime.js' } }],
		};

		const code = injectManifest(
			`if (!${ARCADE_MANIFEST}) throw new Error(); export default ${ARCADE_MANIFEST};`,
			manifest,
		);

		expect(code).toContain('"manifestHash":"abc"');
		expect(code).not.toContain('bundleGraph');
		expect(code).not.toContain('bundleGraphAsset');
		expect(code).toContain('if (false) throw new Error();');
	});
});

function chunk(input: {
	fileName: string;
	name: string;
	code: string;
	imports?: string[];
	dynamicImports?: string[];
	moduleIds: string[];
	facadeModuleId: string;
}): ArcadeManifestBundle[string] {
	return {
		type: 'chunk',
		fileName: input.fileName,
		name: input.name,
		code: input.code,
		exports: [],
		imports: input.imports ?? [],
		dynamicImports: input.dynamicImports ?? [],
		moduleIds: input.moduleIds,
		facadeModuleId: input.facadeModuleId,
	};
}
