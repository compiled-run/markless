import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolStatePayloadFromArena,
	lowerStateAccess,
	planPayloadArena,
} from '../src/index.ts';

const sharedSource = `
import { shared, state, computed } from '@arcade/core';

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

const syncComputedSource = `
import { state, computed } from '@arcade/core';

export function App() @{
	let count = state(0);
	const double = computed(() => count * 2);

	<button>{double}</button>
}
`;

test('createProtocolStatePayloadFromArena serializes sync computed expressions', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: syncComputedSource,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const state = createProtocolStatePayloadFromArena({
		semanticGraph,
		payloadArena,
	});

	expect(state.computed).toEqual([
		{
			graphNodeId: 'computed:double',
			name: 'double',
			async: false,
			dependencies: [{ graphNodeId: 'state:count', path: [] }],
			expression: {
				kind: 'binary',
				operator: '*',
				left: { kind: 'read', graphNodeId: 'state:count', path: [] },
				right: { kind: 'literal', value: 2 },
			},
		},
	]);
});

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
