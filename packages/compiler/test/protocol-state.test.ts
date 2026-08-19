import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolStatePayloadFromArena,
	lowerStateAccess,
	planPayloadArena,
} from '../src/index.ts';

const sharedSource = `
import { shared, state, computed } from '@markless/core';

export const session = shared(() => {
	const data = state({ user: null, status: 'anonymous' });
	const signedIn = computed(() => data.user !== null);

	return {
		...data,
		signedIn,
		logout() {
			data.user = null;
			data.status = 'anonymous';
		},
	};
}, { scope: 'page' });

export function Header() @{
	const currentSession = session();

	<button>{currentSession.status}</button>
}
`;

test('createProtocolStatePayloadFromArena serializes shared definition metadata', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/session.tsrx',
		source: sharedSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const state = createProtocolStatePayloadFromArena({
		semanticGraph,
		payloadArena,
	});

	expect(state.sharedDefinitions).toEqual([
		{
			id: 'shared:src/session.tsrx#session',
			name: 'session',
			exportedName: 'session',
			scope: 'page',
			version: 0,
			graphNodeIds: [
				'shared:src/session.tsrx#session/state:data',
				'shared:src/session.tsrx#session/computed:signedIn',
			],
			returnProperties: [
				{
					kind: 'graph',
					name: 'user',
					graphNodeId: 'shared:src/session.tsrx#session/state:data',
					path: ['user'],
				},
				{
					kind: 'graph',
					name: 'status',
					graphNodeId: 'shared:src/session.tsrx#session/state:data',
					path: ['status'],
				},
				{
					kind: 'graph',
					name: 'signedIn',
					graphNodeId: 'shared:src/session.tsrx#session/computed:signedIn',
					path: [],
				},
				{
					kind: 'method',
					name: 'logout',
				},
			],
		},
	]);
	expect(JSON.stringify(state.sharedDefinitions)).not.toContain('sourceSpan');
});

test('createProtocolStatePayloadFromArena leaves non-literal state initializers render-filled', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/init.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const cfg = { start: 7 };
	const n = state(cfg.start);

	<output>{n}</output>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const state = createProtocolStatePayloadFromArena({
		semanticGraph,
		payloadArena,
	});
	const cell = state.cells.find((candidate) => candidate.graphNodeId === 'state:n');

	expect(cell).toEqual({
		graphNodeId: 'state:n',
		name: 'n',
		valueKind: 'unknown',
	});
	expect(JSON.stringify(cell)).not.toContain('"$type":"undefined"');
});

test('B910 sync computed cell and dependencies are present in protocol payload', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/sync-computed.tsrx',
		source: `
import { state, computed } from '@markless/core';

export function App() @{
	let count = state(2);
	const doubled = computed(() => count * 2);

	<p>{doubled}</p>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const state = createProtocolStatePayloadFromArena({
		semanticGraph,
		payloadArena,
	});

	expect(state.computed).toEqual([
		{
			graphNodeId: 'computed:doubled',
			name: 'doubled',
			async: false,
			deriveSymbolId: 'symbol:1',
			dependencies: [{ graphNodeId: 'state:count', path: [] }],
		},
	]);
});

// Composition qualifies a composed child's ids by concatenating its instance
// path, with no classifier at runtime. These two cases were a runtime refusal in
// packages/web; the refusal now happens once, here, where the payload is minted.
for (const family of ['cells', 'computed'] as const) {
	test(`payload emission refuses an unclassifiable ${family} graph node id`, async () => {
		const semanticGraph = await buildSemanticGraph({
			filename: 'src/mystery.tsrx',
			source: `
import { state, computed } from '@markless/core';

export function Page() @{
	let count = state(2);
	const doubled = computed(() => count * 2);

	<p>{doubled}</p>
}
`,
		});
		const stateLowering = lowerStateAccess({ semanticGraph });
		const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
		const arena = {
			...payloadArena,
			state: {
				...payloadArena.state,
				[family]: payloadArena.state[family].map((node) => ({
					...node,
					graphNodeId: 'mystery:report',
				})),
			},
		};

		expect(() =>
			createProtocolStatePayloadFromArena({ semanticGraph, payloadArena: arena }),
		).toThrowError(/MARKLESS_COMPOSED_GRAPH_NODE_UNCLASSIFIED: .*"mystery:report"/);
	});
}
