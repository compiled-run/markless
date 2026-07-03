import { describe, expect, test } from 'vitest';
import {
	convertManifestToBundleGraph,
	createPreloadGraphAdder,
} from '../src/build/bundle-graph.ts';
import {
	createBuildMetadata,
	type MarklessBuildMetadataBundle,
} from '../src/build/build-metadata.ts';
import { MARKLESS_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import {
	collectHeadLinkInjections,
	collectModulePreloadInjections,
} from '../src/build/head-links.ts';
import type { MarklessManifest, MarklessTransformManifest } from '../src/types.ts';

const transformManifest: MarklessTransformManifest = {
	source: '/workspace/app/src/root.tsrx',
	payload: { virtualModuleId: 'virtual:markless:payload:root' },
	resolver: { virtualModuleId: 'virtual:markless:resolver:root' },
	symbols: [
		{
			symbolId: 'root#click',
			kind: 'event-handler',
			exportName: 'onClick',
			virtualModuleId: 'virtual:markless:symbol:root:click',
		},
	],
};

describe('markless build metadata output', () => {
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
					moduleIds: ['\0virtual:markless:symbol:root:click'],
					facadeModuleId: '\0virtual:markless:symbol:root:click',
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
				bundleGraphAsset: MARKLESS_BUNDLE_GRAPH,
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
		expect(metadata.assets?.[MARKLESS_BUNDLE_GRAPH]).toEqual({
			name: 'bundle-graph.json',
			size: JSON.stringify(metadata.bundleGraph).length,
		});
		expect(metadata.bundleGraphAsset).toBe(MARKLESS_BUNDLE_GRAPH);
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

	test('plans entry-chain dynamic imports through dynamic-only entry roots', () => {
		// The resume runtime's own dynamic imports (journal/settle modules) hang
		// off the ENTRY chunk, not off any symbol root: the injection collector
		// must accept entry chunks as dynamic-only roots so those
		// interaction-reachable chunks preload without re-linking the entry's
		// already-loading static closure.
		const graph = convertManifestToBundleGraph({
			version: 1,
			modules: [],
			bundles: {
				'main.js': {
					size: 700,
					total: 700,
					imports: ['kit.js'],
					symbols: [],
					origins: ['src/main.ts'],
				},
				'kit.js': {
					size: 700,
					total: 700,
					imports: [],
					dynamicImports: ['applier.js'],
					symbols: [],
					origins: ['src/kit-runtime.ts'],
				},
				'applier.js': {
					size: 40000,
					total: 40000,
					imports: [],
					symbols: [],
					origins: ['src/applier-runtime.ts'],
				},
			},
		} as never);

		const injections = collectModulePreloadInjections(graph, {
			entryChunks: ['main.js'],
		});

		const hrefs = injections.map(
			(injection) => (injection.attributes as { href: string }).href,
		);
		expect(hrefs).toContain('/build/applier.js');
		expect(hrefs).not.toContain('/build/main.js');
		expect(hrefs).not.toContain('/build/kit.js');
	});

	test('collects modulepreload head links for lazy symbol bundle graph roots', () => {
		const graph = convertManifestToBundleGraph(lazySymbolManifest());

		const injections = collectModulePreloadInjections(graph);

		expect(injections).toEqual(
			['/build/shared.js', '/build/press.js', '/build/text.js'].map((href) => ({
				tag: 'link',
				location: 'head',
				attributes: {
					rel: 'modulepreload',
					href,
					crossorigin: 'anonymous',
					fetchpriority: 'high',
				},
			})),
		);
	});

	test('converts symbol and custom preload entries into the bundle graph', () => {
		const manifest: MarklessManifest = {
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

function lazySymbolManifest(): MarklessManifest {
	const symbol = (name: string, kind: 'event-handler' | 'dom-update') => ({
		symbolId: `symbol:${name}`,
		kind,
		exportName: name,
		virtualModuleId: `virtual:markless:symbol:root:${name}`,
		fileName: `${name}.js`,
	});
	return {
		version: 1,
		modules: [
			{
				...transformManifest,
				symbols: [symbol('press', 'event-handler'), symbol('text', 'dom-update')],
			},
		],
		bundles: {
			'press.js': {
				size: 900,
				total: 1900,
				imports: ['shared.js'],
				origins: ['src/root.tsrx'],
			},
			'text.js': {
				size: 500,
				total: 1500,
				imports: ['shared.js'],
				origins: ['src/root.tsrx'],
			},
			'shared.js': { size: 500, total: 500, origins: ['src/shared.ts'] },
		},
	};
}

function chunk(input: {
	fileName: string;
	name: string;
	code: string;
	imports?: string[];
	dynamicImports?: string[];
	moduleIds: string[];
	facadeModuleId: string;
	viteMetadata?: { importedCss?: Set<string> };
}): MarklessBuildMetadataBundle[string] {
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
