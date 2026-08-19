import { expect, test } from 'vitest';
import { linkCompilerPasses } from '../src/pass-registry.ts';
import { computeExecutionAttribution } from '../src/passes/link/attribution.ts';

// The linker owns resolution and encoding; the pass reads them as inputs.
const resolveSpecifier = (parent: string, specifier: string) =>
	specifier.startsWith('.')
		? `${parent.slice(0, parent.lastIndexOf('/'))}/${specifier.replace(/^\.\//, '')}`
		: specifier;
const encodeSource = (source: string) => encodeURIComponent(source);

test('execution-attribution is registered as a link pass with its artifact boundary', () => {
	expect(linkCompilerPasses).toContainEqual({
		passId: 'execution-attribution',
		description: expect.stringContaining('execution scope tables'),
		consumes: ['moduleManifests', 'childTable'],
		produces: ['executionAttribution'],
	});
});

test('two module manifests and a child table produce the fixture route keys and scopes', () => {
	const artifact = computeExecutionAttribution({
		moduleManifests: [
			// The queried transform variant merges into the bare source node.
			{ source: '/app/pages/home.tsrx?markless-symbols', symbolRoutes: [] },
			{
				source: '/app/pages/home.tsrx',
				symbolRoutes: [{ prefix: 'a', importSource: './widget.tsrx' }],
			},
			{ source: '/app/pages/widget.tsrx', symbolRoutes: [] },
		],
		childTable: [
			{
				parent: '/app/pages/home.tsrx',
				specifier: './widget.tsrx',
				source: '/app/pages/widget.tsrx',
			},
		],
		root: '/app/',
		resolveSpecifier,
		encodeSource,
	});

	expect(artifact.passId).toBe('execution-attribution');
	expect(artifact.diagnostics).toEqual([]);
	expect(artifact.roots).toEqual(['/app/pages/home.tsrx']);
	expect(artifact.tables).toEqual({
		'pages/home.tsrx': {
			'': encodeURIComponent('/app/pages/home.tsrx'),
			a: encodeURIComponent('/app/pages/widget.tsrx'),
		},
	});
});

test('two distinct routes never collapse to one key', () => {
	const artifact = computeExecutionAttribution({
		moduleManifests: [
			{ source: '/app/pages/one.tsrx', symbolRoutes: [] },
			{ source: '/app/pages/two.tsrx', symbolRoutes: [] },
		],
		childTable: [],
		root: '/app',
		resolveSpecifier,
		encodeSource,
	});

	expect(Object.keys(artifact.tables)).toEqual(['pages/one.tsrx', 'pages/two.tsrx']);
	expect(artifact.tables['pages/one.tsrx']).toEqual({
		'': encodeURIComponent('/app/pages/one.tsrx'),
	});
	expect(artifact.tables['pages/two.tsrx']).toEqual({
		'': encodeURIComponent('/app/pages/two.tsrx'),
	});
});
