import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

// A guard comparing a prop or a state() to a literal reads the graph like a bare
// read does, so it runs before the handler loads instead of being refused.
function linkModule(guard: string): string {
	return `
import { state } from '@markless/core';

const SHOW = '/show';

export function NavLink({ href }: { href: string }) @{
	let here = state('/news');
	let count = state(0);

	<a
		href={href}
		onClick={(event) => {
			if (${guard}) event.preventDefault();
			count++;
		}}
	>{count}</a>
}
`;
}

async function syncPolicyFor(guard: string) {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/NavLink.tsrx',
		source: linkModule(guard),
	});
	return {
		syncPolicy: semanticGraph.events[0]?.syncPolicy,
		diagnostics: semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

test('a prop compared with a string literal extracts as a graph equality', async () => {
	await expect(syncPolicyFor("href === '/show'")).resolves.toEqual({
		syncPolicy: {
			when: {
				type: 'graph-truthy',
				graphNodeId: 'prop:props',
				path: ['href'],
				equals: '/show',
			},
			actions: ['preventDefault'],
		},
		diagnostics: [],
	});
});

test('a state compared with a literal on either side, or with a module constant, extracts the same', async () => {
	const expected = {
		syncPolicy: {
			when: { type: 'graph-truthy', graphNodeId: 'state:here', path: [], equals: '/show' },
			actions: ['preventDefault'],
		},
		diagnostics: [],
	};
	await expect(syncPolicyFor("here === '/show'")).resolves.toEqual(expected);
	await expect(syncPolicyFor("'/show' === here")).resolves.toEqual(expected);
	await expect(syncPolicyFor('here === SHOW')).resolves.toEqual(expected);
});

test('`!==` against a graph read negates the equality', async () => {
	await expect(syncPolicyFor("here !== '/show' && !event.metaKey")).resolves.toMatchObject({
		syncPolicy: {
			when: {
				type: 'and',
				conditions: [
					{
						type: 'not',
						condition: { type: 'graph-truthy', graphNodeId: 'state:here', equals: '/show' },
					},
					{ type: 'not', condition: { type: 'event-equals', field: 'metaKey', value: true } },
				],
			},
		},
		diagnostics: [],
	});
});

test('two graph reads compared with each other, or a browser global, stay refused', async () => {
	for (const guard of ['here === href', 'location.pathname === href']) {
		await expect(syncPolicyFor(guard)).resolves.toEqual({
			syncPolicy: undefined,
			diagnostics: ['MARKLESS_SYNC_POLICY_UNEXTRACTABLE'],
		});
	}
});
