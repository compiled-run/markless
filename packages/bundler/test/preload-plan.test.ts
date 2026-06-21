import { describe, expect, test } from 'vitest';
import { convertManifestToBundleGraph } from '../src/build/bundle-graph.ts';
import { planModulePreloadUrls, planModulePreloads } from '../src/build/preload-plan.ts';
import type { ArcadeManifest } from '../src/types.ts';

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
});

function manifestWithComplexSymbolDeps(): ArcadeManifest {
	return {
		version: 1,
		manifestHash: 'test',
		modules: [
			{
				source: '/workspace/app/src/root.tsrx',
				payload: { virtualModuleId: 'virtual:arcade:payload:root' },
				resolver: { virtualModuleId: 'virtual:arcade:resolver:root' },
				moduleManifest: { virtualModuleId: 'virtual:arcade:module-manifest:root' },
				symbols: [
					{
						symbolId: 'symbol:click',
						kind: 'event-handler',
						exportName: 'onClick',
						virtualModuleId: 'virtual:arcade:symbol:root:click',
						fileName: 'build/click.js',
					},
					{
						symbolId: 'symbol:visible',
						kind: 'event-handler',
						exportName: 'onVisible',
						virtualModuleId: 'virtual:arcade:symbol:root:visible',
						fileName: 'build/visible.js',
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
