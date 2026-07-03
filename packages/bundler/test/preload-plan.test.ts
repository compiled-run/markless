import { describe, expect, test } from 'vitest';
import { convertManifestToBundleGraph } from '../src/build/bundle-graph.ts';
import { planModulePreloadUrls, planModulePreloads } from '../src/build/preload-plan.ts';
import { planSsrModulePreloads } from '../src/build/preload-plan-ssr.ts';
import type { MarklessManifest } from '../src/types.ts';

describe('module preload planning', () => {
	test('expands symbol roots through static imports and likely dynamic descendants', () => {
		const graph = convertManifestToBundleGraph(manifestWithComplexSymbolDeps());

		const preloads = planModulePreloadUrls({
			base: '/assets/',
			bundleGraph: graph,
			minProbability: 0.5,
			roots: ['symbol:click'],
		});

		expect(preloads).toEqual([
			'/assets/build/vendor.js',
			'/assets/build/shared.js',
			'/assets/build/click.js',
			'/assets/build/nested.js',
		]);
	});

	test('plans chained dynamic descendants by default (exact preloads, no waterfalls)', () => {
		// Alternate-shaped graph (per the fixture-hardcoding guardrail): a
		// wizard flow whose panel chunk dynamically imports a validator, which
		// dynamically imports a formatter. Chained dynamic-edge probabilities
		// decay below the old 0.5 default, so these interaction-reachable
		// chunks were pruned from CSR head preloads — they executed post-click
		// without ever being preloaded. Exactness is the contract: everything
		// reachable from an interaction's roots preloads BY DEFAULT.
		const graph = convertManifestToBundleGraph({
			version: 1,
			modules: [
				{
					source: '/workspace/app/src/wizard.tsrx',
					payload: { virtualModuleId: 'virtual:markless:payload:wizard' },
					resolver: { virtualModuleId: 'virtual:markless:resolver:wizard' },
					symbols: [
						{
							symbolId: 'symbol:advance',
							kind: 'event-handler',
							exportName: 'onAdvance',
							virtualModuleId: 'virtual:markless:symbol:wizard:advance',
							fileName: 'build/panel.js',
						},
					],
				},
			],
			bundles: {
				'build/panel.js': {
					size: 700,
					total: 700,
					imports: [],
					dynamicImports: ['build/validator.js'],
					symbols: ['symbol:advance'],
					origins: ['src/wizard.tsrx'],
				},
				// Unrelated origin + large total mirrors the real pruned chunks
				// (framework runtime modules dynamically imported cross-origin):
				// edge probability lands below the old 0.5 default.
				'build/validator.js': {
					size: 40000,
					total: 40000,
					imports: [],
					dynamicImports: ['build/formatter.js'],
					symbols: [],
					origins: ['src/shared-runtime.ts'],
				},
				'build/formatter.js': {
					size: 40000,
					total: 40000,
					imports: [],
					symbols: [],
					origins: ['src/format-runtime.ts'],
				},
			},
		} as never);

		const preloads = planModulePreloadUrls({
			base: '/assets/',
			bundleGraph: graph,
			roots: ['symbol:advance'],
		});

		expect(preloads).toContain('/assets/build/panel.js');
		expect(preloads).toContain('/assets/build/validator.js');
		expect(preloads).toContain('/assets/build/formatter.js');
	});

	test('dedupes shared transitive chunks across multiple symbol roots', () => {
		const graph = convertManifestToBundleGraph(manifestWithComplexSymbolDeps());

		const preloads = planModulePreloadUrls({
			bundleGraph: graph,
			roots: ['symbol:click', 'symbol:visible'],
		});

		expect(preloads.filter((url) => url === 'build/shared.js')).toHaveLength(1);
		expect(preloads).toContain('build/click.js');
		expect(preloads).toContain('build/visible.js');
	});

	test('includes the generated resolver chunk for lazy symbol roots', () => {
		const graph = convertManifestToBundleGraph(manifestWithResolverChunk());

		const preloads = planModulePreloadUrls({
			base: '/assets/',
			bundleGraph: graph,
			roots: ['symbol:click'],
		});

		expect(preloads).toContain('/assets/build/resolver.js');
		expect(preloads.indexOf('/assets/build/resolver.js')).toBeLessThan(
			preloads.indexOf('/assets/build/click.js'),
		);
	});

	test('keeps framework API priority and fetch priority on planned links', () => {
		const graph = convertManifestToBundleGraph(manifestWithComplexSymbolDeps());

		const preloads = planModulePreloads({
			base: '/assets/',
			bundleGraph: graph,
			roots: [
				{ name: 'symbol:visible', priority: 'low' },
				{ name: 'symbol:click', priority: 'high' },
			],
		});

		expect(preloads.map((preload) => preload.href)).toEqual([
			'/assets/build/vendor.js',
			'/assets/build/shared.js',
			'/assets/build/click.js',
			'/assets/build/nested.js',
			'/assets/build/visible.js',
		]);
		expect(preloads.filter((preload) => preload.fetchPriority === 'high')).toHaveLength(4);
		expect(preloads.at(-1)).toMatchObject({
			fetchPriority: 'low',
			href: '/assets/build/visible.js',
			priority: 'low',
		});
		expect(preloads.find((preload) => preload.href.endsWith('/build/shared.js'))).toMatchObject(
			{
				fetchPriority: 'high',
				priority: 'high',
			},
		);
	});

	test('plans SSR preloads from a render artifact and resume module URL', () => {
		const graph = convertManifestToBundleGraph(manifestWithComplexSymbolDeps());

		const preloads = planSsrModulePreloads({
			artifact: {
				payloadView: {
					events: [{ symbolIds: ['symbol:click'] }],
					domUpdates: [{ symbolId: 'symbol:visible' }],
					behaviors: [{ symbolId: 'symbol:behavior' }],
					asyncBoundaries: [{ asyncReads: [{ runnerSymbolId: 'symbol:async-runner' }] }],
				},
			},
			base: '/assets/',
			bundleGraph: graph,
			resumeModuleUrl: '/assets/build/resume.js',
		});

		expect(preloads.map((preload) => preload.href)).toEqual([
			'/assets/build/vendor.js',
			'/assets/build/shared.js',
			'/assets/build/click.js',
			'/assets/build/nested.js',
			'/assets/build/behavior.js',
			'/assets/build/resume.js',
			'/assets/build/visible.js',
			'/assets/build/async-runner.js',
		]);
	});

	test('keeps Vite dev module URLs as SSR preload roots without a bundle graph', () => {
		const preloads = planSsrModulePreloads({
			artifact: { payloadView: { events: [{ symbolIds: ['symbol:click'] }] } },
			bundleGraph: undefined,
			resumeModuleUrl: '/src/App.tsrx?import',
		});

		expect(preloads).toEqual([
			{
				fetchPriority: 'high',
				href: '/src/App.tsrx?import',
				name: '/src/App.tsrx?import',
				priority: 'high',
				probability: 1,
			},
		]);
	});

	test('keeps nested SSR resume resolver chunks above the preload threshold', () => {
		const preloads = planSsrModulePreloads({
			artifact: { payloadView: { events: [] } },
			base: '/build/',
			bundleGraph: ['resume.js', -5, 3, 'child-resolver.js', -5, 6, 'grandchild-resolver.js'],
			resumeModuleUrl: '/build/resume.js',
		});

		expect(preloads.map((preload) => preload.href)).toEqual([
			'/build/resume.js',
			'/build/child-resolver.js',
			'/build/grandchild-resolver.js',
		]);
	});
});

function manifestWithComplexSymbolDeps(): MarklessManifest {
	return {
		version: 1,
		modules: [
			{
				source: '/workspace/app/src/root.tsrx',
				payload: { virtualModuleId: 'virtual:markless:payload:root' },
				resolver: { virtualModuleId: 'virtual:markless:resolver:root' },
				symbols: [
					{
						symbolId: 'symbol:click',
						kind: 'event-handler',
						exportName: 'onClick',
						virtualModuleId: 'virtual:markless:symbol:root:click',
						fileName: 'build/click.js',
					},
					{
						symbolId: 'symbol:visible',
						kind: 'event-handler',
						exportName: 'onVisible',
						virtualModuleId: 'virtual:markless:symbol:root:visible',
						fileName: 'build/visible.js',
					},
					{
						symbolId: 'symbol:behavior',
						kind: 'behavior',
						exportName: 'installBehavior',
						virtualModuleId: 'virtual:markless:symbol:root:behavior',
						fileName: 'build/behavior.js',
					},
					{
						symbolId: 'symbol:async-runner',
						kind: 'async-runner',
						exportName: 'runAsync',
						virtualModuleId: 'virtual:markless:symbol:root:async-runner',
						fileName: 'build/async-runner.js',
					},
				],
			},
		],
		bundles: {
			'build/click.js': {
				size: 900,
				total: 1900,
				imports: ['build/shared.js'],
				dynamicImports: ['build/nested.js'],
				symbols: ['symbol:click'],
				origins: ['src/root.tsrx'],
			},
			'build/visible.js': {
				size: 900,
				total: 1900,
				imports: ['build/shared.js'],
				symbols: ['symbol:visible'],
				origins: ['src/root.tsrx'],
			},
			'build/behavior.js': {
				size: 900,
				total: 1900,
				imports: ['build/shared.js'],
				symbols: ['symbol:behavior'],
				origins: ['src/root.tsrx'],
			},
			'build/async-runner.js': {
				size: 900,
				total: 1900,
				imports: ['build/shared.js'],
				symbols: ['symbol:async-runner'],
				origins: ['src/root.tsrx'],
			},
			'build/shared.js': {
				size: 500,
				total: 1000,
				imports: ['build/vendor.js'],
				origins: ['src/shared.ts'],
			},
			'build/vendor.js': {
				size: 500,
				total: 500,
				origins: ['node_modules/vendor/index.js'],
			},
			'build/nested.js': {
				size: 500,
				total: 500,
				origins: ['src/nested.ts'],
			},
		},
	};
}

function manifestWithResolverChunk(): MarklessManifest {
	return {
		version: 1,
		modules: [
			{
				source: '/workspace/app/src/root.tsrx',
				payload: { virtualModuleId: 'virtual:markless:payload:root' },
				resolver: {
					fileName: 'build/resolver.js',
					virtualModuleId: 'virtual:markless:resolver:root',
				},
				symbols: [
					{
						symbolId: 'symbol:click',
						kind: 'event-handler',
						exportName: 'onClick',
						virtualModuleId: 'virtual:markless:symbol:root:click',
						fileName: 'build/click.js',
					},
				],
			},
		],
		bundles: {
			'build/click.js': {
				size: 900,
				total: 900,
				symbols: ['symbol:click'],
				origins: ['src/root.tsrx'],
			},
			'build/resolver.js': {
				size: 500,
				total: 500,
				origins: ['src/root.tsrx'],
			},
		},
	};
}
