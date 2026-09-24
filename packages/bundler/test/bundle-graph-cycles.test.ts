import { expect, test } from 'vitest';
import { convertManifestToBundleGraph } from '../src/build/bundle-graph.ts';
import { parseBundleGraph, planModulePreloadUrls } from '../src/build/preload-plan.ts';
import type { MarklessManifest } from '../src/types.ts';

function manifest(imports: Record<string, string[]>): MarklessManifest {
	return {
		version: 1,
		modules: [],
		bundles: Object.fromEntries(
			Object.entries(imports).map(([name, dependencies]) => [
				name,
				{ size: 100, total: 100, imports: dependencies, symbols: [], origins: [] },
			]),
		),
	};
}

test.each([
	{ 'self.js': ['self.js'] },
	{ 'menu.js': ['state.js'], 'state.js': ['menu.js'] },
	{
		'editor.js': ['model.js', 'format.js'],
		'model.js': ['selection.js', 'format.js'],
		'selection.js': ['editor.js'],
		'format.js': [],
	},
])('retains the preload closure from either side of a static cycle: %j', (imports) => {
	const input = manifest(imports);
	const graph = convertManifestToBundleGraph(input);
	for (const name of Object.keys(imports)) {
		const expected = new Set<string>();
		const pending = [name];
		while (pending.length) {
			const current = pending.pop()!;
			if (expected.has(current)) continue;
			expected.add(current);
			pending.push(...imports[current]!);
		}
		expect(planModulePreloadUrls({ bundleGraph: graph, roots: [name] }).sort()).toEqual(
			[...expected].sort(),
		);
	}
	const reordered = manifest(
		Object.fromEntries(
			Object.entries(imports)
				.reverse()
				.map(([name, deps]) => [name, [...deps].reverse()]),
		),
	);
	expect(convertManifestToBundleGraph(reordered)).toEqual(graph);
});

test('a static cycle retains the dynamic destinations of its members', () => {
	const input = manifest({
		'shell.js': ['state.js'],
		'state.js': ['shell.js'],
		'dialog.js': ['shared.js'],
		'shared.js': [],
	});
	input.bundles['state.js']!.dynamicImports = ['dialog.js'];
	const graph = convertManifestToBundleGraph(input);
	expect(planModulePreloadUrls({ bundleGraph: graph, roots: ['shell.js'] }).sort()).toEqual([
		'dialog.js',
		'shared.js',
		'shell.js',
		'state.js',
	]);
	expect(parseBundleGraph(graph).get('state.js')?.deps).toContainEqual({
		name: 'dialog.js',
		kind: 'dynamic',
		probability: 0.7,
	});
});

test('an acyclic graph still removes redundant static edges', () => {
	const graph = convertManifestToBundleGraph(
		manifest({
			'entry.js': ['control.js', 'shared.js'],
			'control.js': ['shared.js'],
			'shared.js': [],
		}),
	);
	expect(parseBundleGraph(graph).get('entry.js')?.deps).toEqual([
		{ name: 'control.js', kind: 'static', probability: 1 },
	]);
});
