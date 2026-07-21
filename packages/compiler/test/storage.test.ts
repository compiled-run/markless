import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import { renderBodyLines } from '../src/passes/public-render/render-body.ts';

const validStorageSource = `
import { storage } from '@markless/core';

export const theme = storage('theme-mode', 'light');

export function App() @{
	<p>{theme}</p>
}
`;

test('semantic graph records module storage as writable state metadata', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/settings.tsrx',
		source: validStorageSource,
	});

	expect(graph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'storage:src/settings.tsrx#theme-mode',
			name: 'theme',
			kind: 'state',
			declarationKind: 'const',
			writable: true,
			valueKind: 'scalar',
			initialValue: 'light',
			storage: { key: 'theme-mode' },
		}),
	]);
	expect(graph.templateReads).toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'theme' })]),
	);
	expect(graph.diagnostics).toEqual([]);
	expect(graph.moduleGraphInterface.exports).toEqual([
		{
			exportName: 'theme',
			localName: 'theme',
			kind: 'graph-binding',
			bindingKind: 'state',
		},
	]);
});

test.each([
	{
		name: 'dynamic key',
		declaration: "const theme = storage(key, 'light');",
	},
	{
		name: 'invalid key characters',
		declaration: "const theme = storage('Theme_mode', 'light');",
	},
	{
		name: 'dynamic fallback',
		declaration: "const theme = storage('theme-mode', fallback);",
	},
])('storage rejects $name without recording a binding', async ({ declaration }) => {
	const graph = await buildSemanticGraph({
		filename: 'src/settings.tsrx',
		source: `import { storage } from '@markless/core';\n${declaration}`,
	});

	expect(graph.graphBindings).toEqual([]);
	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STORAGE_KEY_STATIC',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
		}),
	]);
});

test('public render lowering removes executable storage calls', async () => {
	const result = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: validStorageSource,
		symbols: [],
	});

	expect(result.semanticGraph.components).toEqual([{ name: 'App' }]);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.protocolView.domUpdates).toEqual([
		expect.objectContaining({
			source: 'theme',
			graphNodeId: 'storage:src/settings.tsrx#theme-mode',
			path: [],
		}),
	]);
	const emittedSources = [
		result.publicRenderModule.moduleSource,
		result.publicRenderModule.csrModuleSource,
		result.publicRenderModule.ssrModuleSource,
	];
	for (const emittedSource of emittedSources) expect(emittedSource).not.toContain('storage(');
	expect(result.publicRenderModule.ssrModuleSource).toContain("const theme = 'light';");
});

test('render body lowering treats storage metadata as a state initializer', () => {
	const storageDeclaration = {
		type: 'VariableDeclaration',
		declarations: [
			{
				type: 'VariableDeclarator',
				id: { type: 'Identifier', name: 'theme' },
				init: {
					type: 'CallExpression',
					callee: { type: 'Identifier', name: 'storage' },
				},
			},
		],
	};
	const root = { type: 'Element' };
	const component = {
		type: 'FunctionDeclaration',
		body: { type: 'BlockStatement', body: [storageDeclaration, root] },
	};
	const lines = renderBodyLines(
		{
			source: { source: '', filename: 'src/App.tsrx' },
			semanticGraph: {
				graphBindings: [
					{
						id: 'storage:src/App.tsrx#theme-mode',
						name: 'theme',
						kind: 'state',
						writable: true,
						initialValue: 'light',
						storage: { key: 'theme-mode' },
					},
				],
			},
		} as any,
		{ component, root } as any,
		'stateValue',
		'values',
		'payload',
		['return root;'],
	);

	expect(lines).toEqual([
		'\tlet theme = stateValue(values, payload, "storage:src/App.tsrx#theme-mode", "light");',
		'\treturn root;',
	]);
});
