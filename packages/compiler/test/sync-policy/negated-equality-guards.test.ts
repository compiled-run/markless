import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

// `!==` is `!(===)`: it extracts to the same `not` node a written `!` does, so a
// guard can exclude one key or one constant without spelling out every other.
function groupModule(guard: string): string {
	return `
import { state } from '@markless/core';

export function Group() @{
	const group = state({ horizontal: true });
	const mode = 'grid';

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
		diagnostics: semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

test('`event.field !== literal` extracts as the negation of the equality', async () => {
	await expect(syncPolicyFor("event.key !== 'Tab'")).resolves.toEqual({
		syncPolicy: {
			when: { type: 'not', condition: { type: 'event-equals', field: 'key', value: 'Tab' } },
			actions: ['preventDefault'],
		},
		diagnostics: [],
	});
});

test('`!==` matches its written `!(===)` form exactly', async () => {
	const [negated, spelled] = await Promise.all([
		syncPolicyFor("group.horizontal && event.key !== 'Tab'"),
		syncPolicyFor("group.horizontal && !(event.key === 'Tab')"),
	]);

	expect(negated.diagnostics).toEqual([]);
	expect(negated.syncPolicy).toEqual(spelled.syncPolicy);
});

test('`!=` mirrors `==` the way `!==` mirrors `===`', async () => {
	const [loose, strict] = await Promise.all([
		syncPolicyFor("'Tab' != event.key"),
		syncPolicyFor("'Tab' !== event.key"),
	]);

	expect(loose.diagnostics).toEqual([]);
	expect(loose.syncPolicy).toEqual(strict.syncPolicy);
});

test('`!==` over two constants folds to a constant', async () => {
	await expect(syncPolicyFor("mode !== 'grid'")).resolves.toEqual({
		syncPolicy: {
			when: { type: 'not', condition: { type: 'constant-truthy', value: true } },
			actions: ['preventDefault'],
		},
		diagnostics: [],
	});
});

test('`!==` against a local the graph cannot see is still refused', async () => {
	await expect(syncPolicyFor('event.key !== pressed')).resolves.toEqual({
		syncPolicy: undefined,
		diagnostics: ['MARKLESS_SYNC_POLICY_UNEXTRACTABLE'],
	});
});
