import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

// A cancel after `if (guard) return;` runs only when the guard is false, so the policy
// lifted before the handler loads must carry that guard or refuse.
function moduleWith(body: string): string {
	return `
import { state } from '@markless/core';

export function Field() @{
	let open = state(false);

	<input
		onKeyDown={(event) => {
			${body}
		}}
	/>
}
`;
}

async function policyFor(body: string) {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Field.tsrx',
		source: moduleWith(body),
	});
	return {
		syncPolicy: semanticGraph.events[0]?.syncPolicy,
		diagnostics: semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

test('an early return guard folds into the policy as its negation', async () => {
	await expect(
		policyFor(`if (event.key !== 'Enter') return;
			event.preventDefault();`),
	).resolves.toEqual({
		syncPolicy: {
			when: { type: 'event-equals', field: 'key', value: 'Enter' },
			actions: ['preventDefault'],
		},
		diagnostics: [],
	});
});

test('several guards and the cancel statement condition combine with and', async () => {
	const { syncPolicy, diagnostics } = await policyFor(`if (event.key === 'Tab') return;
		if (!open) { return; }
		if (event.key === 'ArrowDown') event.preventDefault();`);
	expect(diagnostics).toEqual([]);
	expect(syncPolicy).toEqual({
		when: {
			type: 'and',
			conditions: [
				{ type: 'not', condition: { type: 'event-equals', field: 'key', value: 'Tab' } },
				{ type: 'graph-truthy', graphNodeId: expect.any(String), path: [] },
				{ type: 'event-equals', field: 'key', value: 'ArrowDown' },
			],
		},
		actions: ['preventDefault'],
	});
});

test('a modifier flag read alone is that flag being true', async () => {
	await expect(
		policyFor(`if (event.metaKey || event.ctrlKey) return;
			if (event.key === 's') event.preventDefault();`),
	).resolves.toEqual({
		syncPolicy: {
			when: {
				type: 'and',
				conditions: [
					{
						type: 'not',
						condition: {
							type: 'or',
							conditions: [
								{ type: 'event-equals', field: 'metaKey', value: true },
								{ type: 'event-equals', field: 'ctrlKey', value: true },
							],
						},
					},
					{ type: 'event-equals', field: 'key', value: 's' },
				],
			},
			actions: ['preventDefault'],
		},
		diagnostics: [],
	});
});

test('a stop after a guard the policy cannot read is still lifted, bounded by the guards it can', async () => {
	const { syncPolicy, diagnostics } =
		await policyFor(`if ((event.target as HTMLElement).closest('a')) return;
		if (event.key === 'Tab') return;
		event.stopPropagation();`);
	expect(diagnostics).toEqual([]);
	expect(syncPolicy).toEqual({
		when: { type: 'not', condition: { type: 'event-equals', field: 'key', value: 'Tab' } },
		actions: ['stopPropagation'],
	});
});

// The DOM part cannot run before the handler loads, so it is taken as not leaving.
test('a partly readable guard bounds the cancel by its readable part', async () => {
	const { syncPolicy, diagnostics } =
		await policyFor(`if (event.key !== 'Enter' && event.key !== ' ') return;
		const hotspot = (event.target as HTMLElement).closest('[data-part]');
		if (!hotspot || event.shiftKey) return;
		event.preventDefault();`);
	expect(diagnostics).toEqual([]);
	expect(syncPolicy).toEqual({
		when: {
			type: 'and',
			conditions: [
				{
					type: 'not',
					condition: {
						type: 'and',
						conditions: [
							{
								type: 'not',
								condition: { type: 'event-equals', field: 'key', value: 'Enter' },
							},
							{
								type: 'not',
								condition: { type: 'event-equals', field: 'key', value: ' ' },
							},
						],
					},
				},
				{
					type: 'not',
					condition: { type: 'event-equals', field: 'shiftKey', value: true },
				},
			],
		},
		actions: ['preventDefault'],
	});
});
