import { expect, test } from 'vitest';
import type { AnyNode } from '../src/ast/nodes.ts';
import {
	extractSyncPolicy,
	hasSyncEventPolicyCandidate,
} from '../src/passes/semantic-graph/collect-sync-policy.ts';
import { createMutableSemanticGraphArtifact } from '../src/passes/semantic-graph/types.ts';

test('sync-policy collector extracts graph and event-field guard policy', () => {
	const source = `(event) => {
	if (menu.open && event.key === 'Escape') {
		event.preventDefault();
		event.stopPropagation();
	}
}`;
	const menuOpenStart = source.indexOf('menu.open');
	const eventKeyStart = source.indexOf('event.key');
	const escapeStart = source.indexOf("'Escape'");
	const preventDefaultStart = source.indexOf('event.preventDefault');
	const stopPropagationStart = source.indexOf('event.stopPropagation');
	const handler = {
		type: 'ArrowFunctionExpression',
		params: [{ type: 'Identifier', name: 'event' }],
		body: {
			type: 'BlockStatement',
			body: [
				{
					type: 'IfStatement',
					test: {
						type: 'LogicalExpression',
						operator: '&&',
						left: {
							type: 'MemberExpression',
							start: menuOpenStart,
							end: menuOpenStart + 'menu.open'.length,
							object: { type: 'Identifier', name: 'menu' },
							property: { type: 'Identifier', name: 'open' },
						},
						right: {
							type: 'BinaryExpression',
							operator: '===',
							left: {
								type: 'MemberExpression',
								start: eventKeyStart,
								end: eventKeyStart + 'event.key'.length,
								object: { type: 'Identifier', name: 'event' },
								property: { type: 'Identifier', name: 'key' },
							},
							right: {
								type: 'Literal',
								start: escapeStart,
								end: escapeStart + "'Escape'".length,
								value: 'Escape',
							},
						},
					},
					consequent: {
						type: 'BlockStatement',
						body: [
							{
								type: 'CallExpression',
								start: preventDefaultStart,
								end: preventDefaultStart + 'event.preventDefault()'.length,
								callee: {
									type: 'MemberExpression',
									object: { type: 'Identifier', name: 'event' },
									property: { type: 'Identifier', name: 'preventDefault' },
								},
							},
							{
								type: 'CallExpression',
								start: stopPropagationStart,
								end: stopPropagationStart + 'event.stopPropagation()'.length,
								callee: {
									type: 'MemberExpression',
									object: { type: 'Identifier', name: 'event' },
									property: { type: 'Identifier', name: 'stopPropagation' },
								},
							},
						],
					},
				},
			],
		},
	} satisfies AnyNode;
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	graph.graphBindings.push({
		id: 'state:menu',
		name: 'menu',
		kind: 'state',
		writable: true,
	});

	expect(hasSyncEventPolicyCandidate(handler)).toBe(true);
	expect(extractSyncPolicy(handler, { graph, source })).toEqual({
		when: {
			type: 'and',
			conditions: [
				{
					type: 'graph-truthy',
					graphNodeId: 'state:menu',
					path: ['open'],
				},
				{
					type: 'event-equals',
					field: 'key',
					value: 'Escape',
				},
			],
		},
		actions: ['preventDefault', 'stopPropagation'],
	});
});

test('sync-policy collector extracts bare unconditional action policy', () => {
	const handler = {
		type: 'ArrowFunctionExpression',
		params: [{ type: 'Identifier', name: 'event' }],
		body: {
			type: 'BlockStatement',
			body: [
				{
					type: 'CallExpression',
					callee: {
						type: 'MemberExpression',
						object: { type: 'Identifier', name: 'event' },
						property: { type: 'Identifier', name: 'preventDefault' },
					},
				},
			],
		},
	} satisfies AnyNode;
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');

	expect(hasSyncEventPolicyCandidate(handler)).toBe(true);
	expect(
		extractSyncPolicy(handler, { graph, source: '(event) => { event.preventDefault(); }' }),
	).toEqual({
		when: { type: 'constant-truthy', value: true },
		actions: ['preventDefault'],
	});
});
