import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import { renderBodyLines } from '../src/passes/public-render/render-body.ts';
import { lowerStateAccess } from '../src/passes/state-lowering.ts';

const validStorageSource = `
import { storage } from '@markless/core';

export let theme = storage('theme-mode', 'light');

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
			declarationKind: 'let',
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

test('semantic graph records const module storage as read-only state metadata', async () => {
	const source = `
import { storage } from '@markless/core';

export const theme = storage('theme-mode', 'light');

export function App() @{
	<button onClick={() => theme = 'dark'}>{theme}</button>
}
`;
	const graph = await buildSemanticGraph({
		filename: 'src/const-settings.tsrx',
		source,
	});
	const targetStart = source.indexOf("theme = 'dark'");

	expect(graph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'storage:src/const-settings.tsrx#theme-mode',
			name: 'theme',
			kind: 'state',
			declarationKind: 'const',
			writable: false,
			valueKind: 'scalar',
			initialValue: 'light',
			storage: { key: 'theme-mode' },
		}),
	]);

	const lowered = lowerStateAccess({ semanticGraph: graph });

	expect(lowered.writes).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_CONST_REASSIGNMENT',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot reassign a const graph binding',
			primarySpan: {
				filename: 'src/const-settings.tsrx',
				start: targetStart,
				end: targetStart + 'theme'.length,
			},
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_CONST_REASSIGNMENT',
		}),
	]);
});

test('compile entry accepts additional framework API import sources', async () => {
	const markless = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: validStorageSource,
		symbols: [],
	});
	const framelessSource = validStorageSource.replace('@markless/core', '@frameless/core');
	const frameless = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: framelessSource,
		symbols: [],
		additionalFrameworkApiSources: ['@frameless/core'],
	});
	const unconfigured = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: framelessSource,
		symbols: [],
	});

	expect(
		frameless.semanticGraph.graphBindings.map(
			({ sourceSpan: _sourceSpan, ...binding }) => binding,
		),
	).toEqual(
		markless.semanticGraph.graphBindings.map(
			({ sourceSpan: _sourceSpan, ...binding }) => binding,
		),
	);
	expect(frameless.semanticGraph.moduleGraphInterface).toEqual(
		markless.semanticGraph.moduleGraphInterface,
	);
	expect(frameless.semanticGraph.moduleImports).toEqual([]);
	expect(frameless.semanticGraph.diagnostics).toEqual([]);
	expect(unconfigured.semanticGraph.graphBindings).toEqual([]);
	expect(unconfigured.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({ code: 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED' }),
	]);
});

test('storage derives markless:<identifier> when the key is omitted', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/settings.tsrx',
		source: `import { storage } from '@markless/core';\nexport let theme = storage('light');\nexport function App() @{ <p>{theme}</p> }`,
	});

	expect(graph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'storage:src/settings.tsrx#markless:theme',
			name: 'theme',
			kind: 'state',
			writable: true,
			initialValue: 'light',
			storage: { key: 'markless:theme' },
		}),
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('storage keeps an explicit key verbatim, including non-kebab characters', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/settings.tsrx',
		source: `import { storage } from '@markless/core';\nexport let theme = storage('Theme_mode', 'light');\nexport function App() @{ <p>{theme}</p> }`,
	});

	expect(graph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'storage:src/settings.tsrx#Theme_mode',
			storage: { key: 'Theme_mode' },
			initialValue: 'light',
		}),
	]);
	expect(graph.diagnostics).toEqual([]);
});

test('derived storage bakes a stable literal key and lowers the executable call', async () => {
	const result = await compileTsrxModule({
		filename: 'src/settings.tsrx',
		source: `import { storage } from '@markless/core';\nexport let theme = storage('light');\nexport function App() @{ <p>{theme}</p> }`,
		symbols: [],
	});

	for (const emittedSource of [
		result.publicRenderModule.moduleSource,
		result.publicRenderModule.ssrModuleSource,
	]) {
		expect(emittedSource).not.toContain('storage(');
	}
	expect(result.publicRenderModule.ssrModuleSource).toContain("let theme = 'light';");
	expect(result.payloadArena.state.storage).toEqual([
		{ graphNodeId: 'storage:src/settings.tsrx#markless:theme', key: 'markless:theme' },
	]);
});

test.each([
	{
		name: 'dynamic key',
		declaration: "const theme = storage(key, 'light');",
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
		result.publicRenderModule.ssrModuleSource,
	];
	for (const emittedSource of emittedSources) expect(emittedSource).not.toContain('storage(');
	expect(result.publicRenderModule.ssrModuleSource).toContain("let theme = 'light';");
	expect(result.payloadArena.state.storage).toEqual([
		{
			graphNodeId: 'storage:src/settings.tsrx#theme-mode',
			key: 'theme-mode',
		},
	]);
	expect(result.protocolState).toMatchObject({
		version: 2,
		storage: [
			{
				graphNodeId: 'storage:src/settings.tsrx#theme-mode',
				key: 'theme-mode',
			},
		],
	});
});

test('payload arena drops declared storage that no component reads or writes', async () => {
	const result = await compileTsrxModule({
		filename: 'src/unused-settings.tsrx',
		source: `
import { storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function App() @{ <p>Static</p> }
`,
		symbols: [],
	});

	expect(result.semanticGraph.graphBindings).toEqual([
		expect.objectContaining({ storage: { key: 'theme-mode' } }),
	]);
	expect(result.payloadArena.state.cells).toEqual([]);
	expect(result.payloadArena.state.storage).toEqual([]);
	expect(result.protocolState.storage).toBeUndefined();
	expect(result.protocolState.version).toBe(1);
});

test('used storage disables lean runtime action plans', async () => {
	const result = await compileTsrxModule({
		filename: 'src/storage-counter.tsrx',
		source: `
import { state, storage } from '@markless/core';
export const theme = storage('theme-mode', 'light');
export function App() @{
	let count = state(0);
	<main data-theme={theme}>
		<button onClick={() => count++}>Add</button>
		<output>{count}</output>
	</main>
}
`,
		symbols: [],
	});

	expect(result.protocolState.storage).toHaveLength(1);
	expect(result.runtimeDemandMap.actions).not.toEqual([]);
	expect(result.runtimeDemandMap.actions.every((action) => action.plan === undefined)).toBe(true);
	expect(result.runtimeDemandMap.recordKinds).toEqual(
		expect.arrayContaining([expect.objectContaining({ kind: 'event', replaced: false })]),
	);
	expect(result.runtimeDemandMap.unknownRecordModuleIds).toContain('core/web/resume');
	expect(result.runtimeDemandMap.unknownRecordModuleIds).toContain('web/payload-full');
	expect(result.runtimeDemandMap.unknownRecordModuleIds).not.toContain(
		'core/web/resume-storage-free',
	);
	expect(result.runtimeDemandMap.unknownRecordModuleIds).not.toContain(
		'web/payload-full-storage-free',
	);
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
