import { expect, test } from 'vitest';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';
import { lowerStateAccess } from '../src/passes/state-lowering.ts';

test('lowerStateAccess preserves update expression operator and prefix metadata', () => {
	const semanticGraph = {
		passId: 'tsrx-semantic-graph',
		filename: 'src/Counter.tsrx',
		components: [{ name: 'Counter' }],
		componentPropBindings: [],
		componentEdges: [],
		graphBindings: [
			{
				id: 'state:count',
				name: 'count',
				kind: 'state',
				declarationKind: 'let',
				writable: true,
				valueKind: 'scalar',
			},
			{
				id: 'state:total',
				name: 'total',
				kind: 'state',
				declarationKind: 'let',
				writable: true,
				valueKind: 'scalar',
			},
		],
		sharedDefinitions: [],
		sharedInstances: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		overlays: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [
			{
				target: 'count',
				operation: 'update',
				updateOperator: '++',
				prefix: false,
			},
			{
				target: 'total',
				operation: 'update',
				updateOperator: '--',
				prefix: true,
			},
		],
		asyncBoundaries: [],
		diagnostics: [],
	} satisfies SemanticGraphArtifact;

	const lowered = lowerStateAccess({ semanticGraph });

	expect(lowered.writes).toEqual([
		{
			source: 'count',
			graphNodeId: 'state:count',
			path: [],
			operation: 'update',
			updateOperator: '++',
			prefix: false,
		},
		{
			source: 'total',
			graphNodeId: 'state:total',
			path: [],
			operation: 'update',
			updateOperator: '--',
			prefix: true,
		},
	]);
	expect(lowered.diagnostics).toEqual([]);
});
