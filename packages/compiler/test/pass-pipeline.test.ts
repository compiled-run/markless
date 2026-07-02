import { expect, test } from 'vitest';
import {
	compileTsrxModule,
	CompilerPassGraphError,
	defaultCompilerPasses,
	formatCompilerArtifactDump,
	runCompilerPassPipeline,
	validateCompilerPassGraph,
} from '../src/index.ts';

const source = `
import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
`;

test('default compiler passes declare stable artifact boundaries', () => {
	expect(defaultCompilerPasses.map((pass) => pass.passId)).toEqual([
		'tsrx-semantic-graph',
		'state-lowering',
		'payload-arena',
		'symbol-resolver',
		'public-render-plan',
		'protocol-state',
		'protocol-view',
		'public-render-module',
		'capture-analysis',
		'payload-scripts',
		'symbol-modules',
		'symbol-resolver-module',
	]);

	expect(defaultCompilerPasses).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				passId: 'state-lowering',
				description: expect.stringContaining('state'),
				consumes: ['semanticGraph'],
				produces: ['stateLowering'],
			}),
			expect.objectContaining({
				passId: 'payload-arena',
				description: expect.stringContaining('payload'),
				consumes: ['semanticGraph', 'stateLowering'],
				produces: ['payloadArena'],
			}),
			expect.objectContaining({
				passId: 'symbol-resolver',
				description: expect.stringContaining('symbol'),
				consumes: ['semanticGraph', 'stateLowering', 'payloadArena'],
				produces: ['symbolResolver'],
			}),
			expect.objectContaining({
				passId: 'public-render-plan',
				description: expect.stringContaining('public render'),
				consumes: ['source', 'semanticGraph', 'payloadArena', 'symbolResolver'],
				produces: ['publicRenderPlan'],
			}),
			expect.objectContaining({
				passId: 'public-render-module',
				description: expect.stringContaining('public render component'),
				consumes: [
					'source',
					'semanticGraph',
					'publicRenderPlan',
					'symbolResolver',
					'protocolState',
					'protocolView',
				],
				produces: ['publicRenderModule'],
			}),
			expect.objectContaining({
				passId: 'capture-analysis',
				description: expect.stringContaining('capture'),
				consumes: ['semanticGraph', 'symbolResolver'],
				produces: ['captureAnalysis'],
			}),
			expect.objectContaining({
				passId: 'symbol-resolver-module',
				description: expect.stringContaining('resolver module'),
				consumes: ['symbolResolverModuleInput'],
				produces: ['symbolResolverModule', 'symbolResolverModuleManifest'],
			}),
			expect.objectContaining({
				passId: 'symbol-modules',
				description: expect.stringContaining('symbol module'),
				consumes: ['symbolResolver', 'captureAnalysis', 'publicRenderPlan'],
				produces: ['symbolModules'],
			}),
		]),
	);
});

test('validateCompilerPassGraph derives runnable order and rejects invalid graphs', () => {
	const ordered = validateCompilerPassGraph(
		[
			{
				passId: 'final',
				description: 'Consumes the middle artifact.',
				consumes: ['middle'],
				produces: ['finalArtifact'],
			},
			{
				passId: 'middle',
				description: 'Consumes the source artifact.',
				consumes: ['source'],
				produces: ['middle'],
			},
		],
		['source'],
	);

	expect(ordered.orderedPassIds).toEqual(['middle', 'final']);
	expect(ordered.artifacts).toEqual(['source', 'middle', 'finalArtifact']);

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'state-lowering',
					description: 'Needs semantic graph input.',
					consumes: ['semanticGraph'],
					produces: ['stateLowering'],
				},
			],
			['source'],
		),
	).toThrow('Missing compiler artifact "semanticGraph" consumed by pass "state-lowering".');

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'First producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
				{
					passId: 'two',
					description: 'Duplicate producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
			],
			['source'],
		),
	).toThrow('Compiler artifact "semanticGraph" is produced by both "one" and "two".');

	expect(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'Waits on two.',
					consumes: ['twoArtifact'],
					produces: ['oneArtifact'],
				},
				{
					passId: 'two',
					description: 'Waits on one.',
					consumes: ['oneArtifact'],
					produces: ['twoArtifact'],
				},
			],
			['source'],
		),
	).toThrow('Compiler pass graph has a dependency cycle involving one, two.');
});

test('validateCompilerPassGraph exposes structured diagnostics for invalid pass graphs', () => {
	const duplicatePass = captureThrown(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'state-lowering',
					description: 'First declaration.',
					consumes: ['semanticGraph'],
					produces: ['stateLowering'],
				},
				{
					passId: 'state-lowering',
					description: 'Second declaration.',
					consumes: ['semanticGraph'],
					produces: ['stateLoweringAgain'],
				},
			],
			['semanticGraph'],
		),
	);

	expect(duplicatePass).toBeInstanceOf(CompilerPassGraphError);
	expect(duplicatePass).toMatchObject({
		code: 'MARKLESS_COMPILER_PASS_GRAPH_INVALID',
		severity: 'error',
		phase: 'runtime',
		title: 'Invalid compiler pass graph',
		reason: 'duplicate-pass-id',
		passId: 'state-lowering',
		artifactKeys: [],
		docsUrl: 'https://markless.dev/errors/MARKLESS_COMPILER_PASS_GRAPH_INVALID',
	});
	expect(duplicatePass).toMatchObject({
		message: 'Compiler pass "state-lowering" is declared more than once.',
		why: expect.stringContaining('stable pass ID'),
	});

	const duplicateProducer = captureThrown(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'First producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
				{
					passId: 'two',
					description: 'Duplicate producer.',
					consumes: ['source'],
					produces: ['semanticGraph'],
				},
			],
			['source'],
		),
	);

	expect(duplicateProducer).toMatchObject({
		code: 'MARKLESS_COMPILER_PASS_GRAPH_INVALID',
		reason: 'duplicate-artifact-producer',
		passId: 'two',
		artifactKeys: ['semanticGraph'],
	});

	const missingArtifact = captureThrown(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'state-lowering',
					description: 'Needs semantic graph input.',
					consumes: ['semanticGraph'],
					produces: ['stateLowering'],
				},
			],
			['source'],
		),
	);

	expect(missingArtifact).toMatchObject({
		code: 'MARKLESS_COMPILER_PASS_GRAPH_INVALID',
		reason: 'missing-artifact',
		passId: 'state-lowering',
		artifactKeys: ['semanticGraph'],
	});

	const cycle = captureThrown(() =>
		validateCompilerPassGraph(
			[
				{
					passId: 'one',
					description: 'Waits on two.',
					consumes: ['twoArtifact'],
					produces: ['oneArtifact'],
				},
				{
					passId: 'two',
					description: 'Waits on one.',
					consumes: ['oneArtifact'],
					produces: ['twoArtifact'],
				},
			],
			['source'],
		),
	);

	expect(cycle).toMatchObject({
		code: 'MARKLESS_COMPILER_PASS_GRAPH_INVALID',
		reason: 'dependency-cycle',
		passId: 'one,two',
		artifactKeys: ['oneArtifact', 'twoArtifact'],
	});
});

test('runCompilerPassPipeline executes passes in graph order and records artifact dumps', async () => {
	const calls: string[] = [];
	const result = await runCompilerPassPipeline({
		initialArtifacts: { source: 'hello' },
		passes: [
			{
				passId: 'final',
				description: 'Consumes middle output.',
				consumes: ['middle'],
				produces: ['finalArtifact'],
				run({ inputs }) {
					calls.push('final');
					expect(inputs).toEqual({ middle: 'hello-middle' });

					return { finalArtifact: `${String(inputs.middle)}!` };
				},
			},
			{
				passId: 'middle',
				description: 'Consumes source input.',
				consumes: ['source'],
				produces: ['middle'],
				run({ inputs }) {
					calls.push('middle');
					expect(inputs).toEqual({ source: 'hello' });

					return { middle: `${String(inputs.source)}-middle` };
				},
			},
		],
		dumpArtifact({ artifactKey, value }) {
			return `${artifactKey}:${String(value)}`;
		},
	});

	expect(calls).toEqual(['middle', 'final']);
	expect(result.passGraph.orderedPassIds).toEqual(['middle', 'final']);
	expect(result.artifacts).toEqual({
		source: 'hello',
		middle: 'hello-middle',
		finalArtifact: 'hello-middle!',
	});
	expect(result.artifactDumps).toEqual([
		{
			passId: 'middle',
			artifactKey: 'middle',
			dump: 'middle:hello-middle',
		},
		{
			passId: 'final',
			artifactKey: 'finalArtifact',
			dump: 'finalArtifact:hello-middle!',
		},
	]);
});

test('formatCompilerArtifactDump creates human-readable pass artifact snapshots', async () => {
	const result = await runCompilerPassPipeline({
		initialArtifacts: { source: 'Ada' },
		passes: [
			{
				passId: 'semantic',
				description: 'Builds the semantic artifact.',
				consumes: ['source'],
				produces: ['semanticGraph'],
				run({ inputs }) {
					return {
						semanticGraph: {
							component: inputs.source,
							diagnostics: [],
							meta: {
								empty: undefined,
								big: 2n,
							},
						},
					};
				},
			},
		],
		dumpArtifact: formatCompilerArtifactDump,
	});

	expect(result.artifactDumps).toEqual([
		{
			passId: 'semantic',
			artifactKey: 'semanticGraph',
			dump: [
				'# semantic -> semanticGraph',
				'',
				'```json',
				'{',
				'  "component": "Ada",',
				'  "diagnostics": [],',
				'  "meta": {',
				'    "big": "2n",',
				'    "empty": "[undefined]"',
				'  }',
				'}',
				'```',
			].join('\n'),
		},
	]);
});

test('compileTsrxModule validates and returns the default pass graph', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source,
		symbols: [
			{
				id: 'symbol:0',
				chunk: '/assets/app.handlers.js',
				exportName: 'onClick_0',
			},
			{
				id: 'symbol:1',
				chunk: '/assets/app.domUpdates.js',
				exportName: 'buttonText_1',
			},
		],
	});

	expect(result.passGraph.orderedPassIds).toEqual(
		defaultCompilerPasses.map((pass) => pass.passId),
	);
	expect(result.passGraph.artifacts).toEqual(
		expect.arrayContaining([
			'source',
			'symbols',
			'symbolResolverModuleInput',
			'semanticGraph',
			'stateLowering',
			'payloadArena',
			'symbolResolver',
			'publicRenderPlan',
			'publicRenderModule',
			'captureAnalysis',
			'protocolState',
			'protocolView',
			'payloadScripts',
			'symbolModules',
			'symbolResolverModule',
			'symbolResolverModuleManifest',
		]),
	);
	expect(result.symbolModules.modules).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'dom-update',
				symbolId: 'symbol:1',
			}),
		]),
	);
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}
