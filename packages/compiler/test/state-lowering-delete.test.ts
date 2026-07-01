import { expect, test } from 'vitest';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';
import { lowerStateAccess } from '../src/passes/state-lowering.ts';

test('lowerStateAccess lowers delete writes to static graph paths', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Menu.tsrx',
		components: [{ name: 'Menu' }],
		componentEdges: [],
		graphBindings: [
			{
				id: 'state:menu',
				name: 'menu',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'object',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [
			{
				target: 'menu.open',
				operation: 'delete',
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([
		{
			source: 'menu.open',
			graphNodeId: 'state:menu',
			path: ['open'],
			operation: 'delete',
		},
	]);
	expect(lowered.diagnostics).toEqual([]);
});

test('lowerStateAccess reports optional delete writes as optional-chain diagnostics', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Menu.tsrx',
		components: [{ name: 'Menu' }],
		componentEdges: [],
		graphBindings: [
			{
				id: 'state:menu',
				name: 'menu',
				kind: 'state',
				declarationKind: 'const',
				writable: true,
				valueKind: 'object',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [
			{
				target: 'menu?.open',
				targetSpan: {
					filename: 'src/Menu.tsrx',
					start: 18,
					end: 28,
				},
				operation: 'delete',
				optional: true,
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([]);
	expect(lowered.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_OPTIONAL_CHAIN_WRITE',
			severity: 'error',
			phase: 'state-lowering',
			passId: 'state-lowering',
			artifactKeys: ['semanticGraph', 'stateLowering'],
			title: 'Cannot write graph state through optional chaining',
			message:
				'Cannot write to "menu?.open" through optional chaining because graph writes must have definite targets.',
			why: 'Optional chaining can skip the method call and its arguments at runtime. The current graph write artifact cannot preserve that short-circuit behavior safely across resume.',
			primarySpan: {
				filename: 'src/Menu.tsrx',
				start: 18,
				end: 28,
			},
			statePath: 'menu?.open',
			source: 'menu?.open',
			docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_OPTIONAL_CHAIN_WRITE',
		}),
	]);
});
