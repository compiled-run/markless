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
	injectHeadLinks,
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

const stripBuildPrefix = (fileName: string) => fileName.replace(/^build\//, '');

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

	test('unions emitted-code dynamic imports the chunk metadata never carried', () => {
		// generateBundle rewrites can leave real dynamic imports in shipped code
		// (template-literal specifiers to init facades) that rolldown's
		// chunk.dynamicImports metadata does not list — the graph then has
		// zero-incoming-edge chunks that execute post-click unpreloaded. The
		// graph's dynamic edges must match the SHIPPED code.
		const metadata = createBuildMetadata(
			{
				'build/chunk-shell.js': chunk({
					fileName: 'build/chunk-shell.js',
					name: 'shell',
					code: 'export async function open(){ const mod = await import(`./chunk-drawer.js`); return mod; }',
					moduleIds: ['/workspace/app/src/shell.ts'],
					facadeModuleId: '/workspace/app/src/shell.ts',
				}),
				'build/chunk-drawer.js': chunk({
					fileName: 'build/chunk-drawer.js',
					name: 'drawer',
					code: 'export const drawer = 1;',
					moduleIds: ['/workspace/app/src/drawer.ts'],
					facadeModuleId: '/workspace/app/src/drawer.ts',
				}),
			} as never,
			[],
			'/workspace/app',
			{},
		);

		expect(metadata.bundles['build/chunk-shell.js']?.dynamicImports).toContain(
			'build/chunk-drawer.js',
		);
	});

	test('collects modulepreload head links for lazy symbol bundle graph roots', () => {
		const graph = convertManifestToBundleGraph(lazySymbolManifest());

		const injections = collectModulePreloadInjections(graph);

		expect(injections).toEqual(
			[
				'/build/shared.js',
				'/build/branch-runtime.js',
				'/build/press.js',
				'/build/text.js',
			].map((href) => ({
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

	test('injects exact modulepreloads once using compact ordered tags', () => {
		const bundle = {
			'index.html': {
				type: 'asset',
				fileName: 'index.html',
				source: '<head></head>',
			},
		};
		const injections = ['/build/first.js', '/build/second.js'].map(
			(href) => ({
				tag: 'link',
				location: 'head' as const,
				attributes: {
					rel: 'modulepreload',
					href,
					crossorigin: 'anonymous',
					fetchpriority: 'high',
				},
			}),
		);

		injectHeadLinks(bundle, [...injections, injections[1]!]);

		expect(bundle['index.html'].source).toBe(
			'<head><link rel=modulepreload href=/build/first.js crossorigin fetchpriority=high><link rel=modulepreload href=/build/second.js crossorigin fetchpriority=high></head>',
		);
	});

	test('collects metadata-backed modulepreloads for every per-symbol chunk', () => {
		const metadata = createBuildMetadata(
			{
				'build/chunk-play.js': chunk({
					fileName: 'build/chunk-play.js',
					name: 'play',
					code: 'export const symbol_1_play = () => {};',
					imports: ['build/shared.js'],
					moduleIds: ['\0virtual:markless:symbol:root:play'],
					facadeModuleId: '\0virtual:markless:symbol:root:play',
				}),
				'build/chunk-write.js': chunk({
					fileName: 'build/chunk-write.js',
					name: 'write',
					code: 'export const symbol_2_write = () => {};',
					imports: ['build/shared.js'],
					moduleIds: ['\0virtual:markless:symbol:root:write'],
					facadeModuleId: '\0virtual:markless:symbol:root:write',
				}),
				'build/shared.js': chunk({
					fileName: 'build/shared.js',
					name: 'shared',
					code: 'export const shared = 1;',
					moduleIds: ['/workspace/app/src/shared.ts'],
					facadeModuleId: '/workspace/app/src/shared.ts',
				}),
			},
			[
				{
					...transformManifest,
					symbols: [
						{
							symbolId: 'action:play',
							kind: 'event-handler',
							exportName: 'symbol_1_play',
							virtualModuleId: 'virtual:markless:symbol:root:play',
						},
						{
							symbolId: 'action:write',
							kind: 'event-handler',
							exportName: 'symbol_2_write',
							virtualModuleId: 'virtual:markless:symbol:root:write',
						},
					],
				},
			],
			'/workspace/app',
			{ bundleGraphAsset: MARKLESS_BUNDLE_GRAPH, canonPath: stripBuildPrefix },
		);

		const hrefs = collectModulePreloadInjections(metadata).map(
			(injection) => (injection.attributes as { href: string }).href,
		);

		expect(hrefs).toEqual([
			'/build/shared.js',
			'/build/chunk-play.js',
			'/build/chunk-write.js',
		]);
	});

	test('extends prerender wake preloads through the built delegated-dispatch closure', () => {
		const metadata = createBuildMetadata(
			{
				'build/resume.js': chunk({
					fileName: 'build/resume.js',
					name: 'resume',
					code: 'import "./linked-render-data.js"; export const wake = () => import("./child-symbol.js");',
					imports: ['build/linked-render-data.js'],
					dynamicImports: ['build/child-symbol.js'],
					moduleIds: ['\0virtual:markless:resume:root'],
					facadeModuleId: '\0virtual:markless:resume:root',
				}),
				'build/linked-render-data.js': chunk({
					fileName: 'build/linked-render-data.js',
					name: 'linked-render-data',
					code: 'export const child = {};',
					moduleIds: ['\0virtual:markless:render-data:child'],
					facadeModuleId: '\0virtual:markless:render-data:child',
				}),
				'build/child-symbol.js': chunk({
					fileName: 'build/child-symbol.js',
					name: 'child-symbol',
					code: 'export const childClick = () => {};',
					moduleIds: ['\0virtual:markless:symbol:child:click'],
					facadeModuleId: '\0virtual:markless:symbol:child:click',
				}),
			},
			[
				{
					...transformManifest,
					source: '/workspace/app/src/Child.tsrx',
					symbols: [
						{
							symbolId: 'symbol:0',
							kind: 'event-handler',
							exportName: 'childClick',
							virtualModuleId: 'virtual:markless:symbol:child:click',
						},
					],
				},
			],
			'/workspace/app',
			{ bundleGraphAsset: MARKLESS_BUNDLE_GRAPH, canonPath: stripBuildPrefix },
		);

		const hrefs = collectModulePreloadInjections(metadata, { wakeChunks: ['resume.js'] }).map(
			(injection) => (injection.attributes as { href: string }).href,
		);

		expect(hrefs).toContain('/build/resume.js');
		expect(hrefs).toContain('/build/linked-render-data.js');
		expect(hrefs).toContain('/build/child-symbol.js');
	});

	test('encodes compact graph edges from symbol roots to separate canonical chunks', () => {
		const metadata = createBuildMetadata(
			{
				'build/chunk-alpha.js': chunk({
					fileName: 'build/chunk-alpha.js',
					name: 'alpha',
					code: 'export const symbol_0_alpha = () => {};',
					moduleIds: ['\0virtual:markless:symbol:root:alpha'],
					facadeModuleId: '\0virtual:markless:symbol:root:alpha',
				}),
				'build/chunk-beta.js': chunk({
					fileName: 'build/chunk-beta.js',
					name: 'beta',
					code: 'export const symbol_1_beta = () => {};',
					moduleIds: ['\0virtual:markless:symbol:root:beta'],
					facadeModuleId: '\0virtual:markless:symbol:root:beta',
				}),
			},
			[
				{
					...transformManifest,
					symbols: [
						{
							symbolId: 'symbol:alpha',
							kind: 'event-handler',
							exportName: 'symbol_0_alpha',
							virtualModuleId: 'virtual:markless:symbol:root:alpha',
						},
						{
							symbolId: 'symbol:beta',
							kind: 'event-handler',
							exportName: 'symbol_1_beta',
							virtualModuleId: 'virtual:markless:symbol:root:beta',
						},
					],
				},
			],
			'/workspace/app',
			{ canonPath: stripBuildPrefix },
		);
		for (const module of metadata.modules) {
			for (const symbol of module.symbols) {
				delete symbol.fileName;
			}
		}
		const graph = convertManifestToBundleGraph(metadata);

		const hrefs = collectModulePreloadInjections(graph).map(
			(injection) => (injection.attributes as { href: string }).href,
		);

		expect(hrefs).toEqual(['/build/chunk-alpha.js', '/build/chunk-beta.js']);
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
				runtimeDemandMap: {
					version: 1,
					recordKinds: [],
					symbols: [
						{
							symbolId: 'symbol:press',
							kind: 'event-handler',
							runtimeModuleIds: ['web/resume-branches'],
						},
					],
					payloadRecords: [],
					actions: [],
					unknownRecordModuleIds: [],
				},
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
			'branch-runtime.js': {
				size: 700,
				total: 700,
				origins: ['../packages/web/src/resume-branches.ts'],
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
