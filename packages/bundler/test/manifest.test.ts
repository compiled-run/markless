import { describe, expect, test } from 'vitest';
import {
	convertManifestToBundleGraph,
	createPreloadGraphAdder,
} from '../src/build/bundle-graph.ts';
import {
	ARCADE_MANIFEST_FILE,
	createBuildMetadata,
	type ArcadeBuildMetadataBundle,
} from '../src/build/build-metadata.ts';
import { ARCADE_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import { collectHeadLinkInjections } from '../src/build/head-links.ts';
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

describe('arcade build metadata output', () => {
	test('creates build metadata from bundler output and transform artifacts', () => {
		const metadata = createBuildMetadata(
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

		expect(metadata.modules[0]).toMatchObject({
			source: '/workspace/app/src/root.tsrx',
			symbols: [
				expect.objectContaining({
					symbolId: 'root#click',
					fileName: 'build/chunk-symbol.js',
				}),
			],
		});
		expect(metadata.bundles['build/chunk-entry.js']).toMatchObject({
			imports: ['build/chunk-symbol.js'],
			origins: ['src/root.tsrx'],
		});
		expect(metadata.bundles['build/chunk-symbol.js']).toMatchObject({
			symbols: ['root#click'],
		});
		expect(metadata.assets?.['build/root.css']).toEqual({ name: 'root.css', size: 6 });
		expect(metadata.assets?.['build/chunk-entry.js.map']).toBeUndefined();
		expect(metadata.assets?.[ARCADE_BUNDLE_GRAPH]).toEqual({
			name: 'bundle-graph.json',
			size: JSON.stringify(metadata.bundleGraph).length,
		});
		expect(ARCADE_MANIFEST_FILE).toBe('arcade-manifest.json');
		expect(metadata.bundleGraphAsset).toBe(ARCADE_BUNDLE_GRAPH);
		expect(metadata.bundleGraph).toContain('root#click');
		expect(metadata.injections).toContainEqual({
			tag: 'link',
			location: 'head',
			attributes: {
				rel: 'stylesheet',
				href: '/assets/build/root.css',
			},
		});
	});

	test('prefers Vite imported CSS metadata when collecting stylesheet head links', () => {
		const injections = collectHeadLinkInjections(
			{
				'build/root.js': chunk({
					fileName: 'build/root.js',
					name: 'root',
					code: 'export default {};',
					moduleIds: ['/workspace/app/src/root.tsrx'],
					facadeModuleId: '/workspace/app/src/root.tsrx',
					viteMetadata: { importedCss: new Set(['build/root.css']) },
				}),
				'build/root.css': {
					type: 'asset',
					fileName: 'build/root.css',
					name: 'root.css',
					names: ['root.css'],
					source: 'body{}',
				},
				'build/unused.css': {
					type: 'asset',
					fileName: 'build/unused.css',
					name: 'unused.css',
					names: ['unused.css'],
					source: '.unused{}',
				},
			},
			{ publicPath: (fileName) => `/assets/${fileName}` },
		);

		expect(injections).toEqual([
			{
				tag: 'link',
				location: 'head',
				attributes: {
					rel: 'stylesheet',
					href: '/assets/build/root.css',
				},
			},
		]);
	});

	test('converts symbol and custom preload entries into the bundle graph', () => {
		const manifest: ArcadeManifest = {
			version: 1,
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
});

function chunk(input: {
	fileName: string;
	name: string;
	code: string;
	imports?: string[];
	dynamicImports?: string[];
	moduleIds: string[];
	facadeModuleId: string;
	viteMetadata?: { importedCss?: Set<string> };
}): ArcadeBuildMetadataBundle[string] {
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
		viteMetadata: input.viteMetadata,
	};
}
