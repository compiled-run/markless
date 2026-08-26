import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

function groupModule(guard: string): string {
	return `
import { state } from '@markless/core';

export function Group() @{
	const group = state({ horizontal: true, locked: false });

	<input
		onKeyDown={(event) => {
			if (${guard}) {
				event.preventDefault();
			}
		}}
	/>
}
`;
}

async function syncPolicyFor(guard: string) {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Group.tsrx',
		source: groupModule(guard),
	});

	return {
		syncPolicy: semanticGraph.events[0]?.syncPolicy,
		hasSyncPolicyCandidate: semanticGraph.events[0]?.hasSyncPolicyCandidate,
		diagnostics: semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

// The formatter re-adds redundant parentheses, so a guard that only round-tripped
// through the formatter must extract exactly as its bare text does.
const parityCases: ReadonlyArray<{
	readonly name: string;
	readonly parenthesized: string;
	readonly bare: string;
}> = [
	{
		name: 'or of two parenthesized ands',
		parenthesized:
			"(group.horizontal && event.key === 'ArrowUp') || (!group.horizontal && event.key === 'ArrowLeft')",
		bare: "group.horizontal && event.key === 'ArrowUp' || !group.horizontal && event.key === 'ArrowLeft'",
	},
	{
		name: 'parenthesized negation and comparison',
		parenthesized: "!(group.locked) && (event.key === 'Escape')",
		bare: "!group.locked && event.key === 'Escape'",
	},
	{
		name: 'nested parentheses',
		parenthesized: "(((group.horizontal))) && ((((event.key === 'ArrowUp'))))",
		bare: "group.horizontal && event.key === 'ArrowUp'",
	},
	{
		name: 'parenthesized literal on the left of an equality',
		parenthesized: "group.horizontal && ('ArrowUp' === event.key)",
		bare: "group.horizontal && 'ArrowUp' === event.key",
	},
];

for (const parityCase of parityCases) {
	test(`parenthesized sync policy guard extracts like the bare text: ${parityCase.name}`, async () => {
		const parenthesized = await syncPolicyFor(parityCase.parenthesized);
		const bare = await syncPolicyFor(parityCase.bare);

		expect(bare.syncPolicy).toBeDefined();
		expect(bare.diagnostics).toEqual([]);
		expect(parenthesized.diagnostics).toEqual([]);
		expect(parenthesized.syncPolicy).toEqual(bare.syncPolicy);
	});
}

test('parenthesized guard keeps the whole extracted policy shape', async () => {
	const { syncPolicy, hasSyncPolicyCandidate } = await syncPolicyFor(
		"(group.horizontal && event.key === 'ArrowUp') || (!group.horizontal && event.key === 'ArrowLeft')",
	);

	expect(hasSyncPolicyCandidate).toBe(true);
	expect(syncPolicy).toEqual({
		when: {
			type: 'or',
			conditions: [
				{
					type: 'and',
					conditions: [
						{ type: 'graph-truthy', graphNodeId: 'state:group', path: ['horizontal'] },
						{ type: 'event-equals', field: 'key', value: 'ArrowUp' },
					],
				},
				{
					type: 'and',
					conditions: [
						{
							type: 'not',
							condition: {
								type: 'graph-truthy',
								graphNodeId: 'state:group',
								path: ['horizontal'],
							},
						},
						{ type: 'event-equals', field: 'key', value: 'ArrowLeft' },
					],
				},
			],
		},
		actions: ['preventDefault'],
	});
});

test('parentheses that carry the grouping are honoured, not flattened away', async () => {
	const { syncPolicy } = await syncPolicyFor(
		"group.horizontal && (event.key === 'ArrowUp' || event.key === 'ArrowDown')",
	);

	expect(syncPolicy).toEqual({
		when: {
			type: 'and',
			conditions: [
				{ type: 'graph-truthy', graphNodeId: 'state:group', path: ['horizontal'] },
				{
					type: 'or',
					conditions: [
						{ type: 'event-equals', field: 'key', value: 'ArrowUp' },
						{ type: 'event-equals', field: 'key', value: 'ArrowDown' },
					],
				},
			],
		},
		actions: ['preventDefault'],
	});
});

test('an unextractable guard inside parentheses is still refused', async () => {
	const parenthesized = await syncPolicyFor('((event.target.value.length > 3))');
	const bare = await syncPolicyFor('event.target.value.length > 3');

	expect(bare.syncPolicy).toBeUndefined();
	expect(bare.diagnostics).toEqual(['MARKLESS_SYNC_POLICY_UNEXTRACTABLE']);
	expect(parenthesized.syncPolicy).toBeUndefined();
	expect(parenthesized.diagnostics).toEqual(bare.diagnostics);
});
