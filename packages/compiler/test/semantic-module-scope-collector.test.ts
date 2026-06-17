import { expect, test } from 'vitest';
import type { AnyNode } from '../src/ast/nodes.ts';
import { collectModuleScopeGraphCreation } from '../src/passes/semantic-graph/collect-module-scope.ts';
import {
	createMutableSemanticGraphArtifact,
	createWalkState,
} from '../src/passes/semantic-graph/types.ts';

test('module-scope collector reports state and computed creation diagnostics', () => {
	const source = 'const count = state(0);';
	const initStart = source.indexOf('state(0)');
	const statement = {
		type: 'VariableDeclaration',
		declarations: [
			{
				type: 'VariableDeclarator',
				id: {
					type: 'Identifier',
					name: 'count',
					start: source.indexOf('count'),
					end: source.indexOf('count') + 'count'.length,
				},
				init: {
					type: 'CallExpression',
					start: initStart,
					end: initStart + 'state(0)'.length,
					callee: {
						type: 'Identifier',
						name: 'state',
					},
				},
			},
		],
	} satisfies AnyNode;
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
		frameworkApiImports: new Map([['state', 'state']]),
	});

	collectModuleScopeGraphCreation(statement, state);

	expect(graph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'ARCADE_STATE_MODULE_SCOPE',
			phase: 'semantic-graph',
			passId: 'tsrx-semantic-graph',
			message: 'Cannot create "count" with state() at module scope.',
			primarySpan: {
				filename: 'src/App.tsrx',
				start: initStart,
				end: initStart + 'state(0)'.length,
			},
		}),
	]);
});
