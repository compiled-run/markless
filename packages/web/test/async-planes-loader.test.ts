import { afterEach, expect, test, vi } from 'vitest';

// An MDX page's islands have not loaded when its resume builds the graph, so its route leaves a loader for their planes.
type Host = { __marklessAsyncPlanes?: (state: { computed: { holds?: true }[] }) => Promise<unknown> };
const host = globalThis as Host;

afterEach(() => {
	delete host.__marklessAsyncPlanes;
});

function payload(holds: boolean) {
	return {
		state: {
			version: 1,
			cells: [{ graphNodeId: 'state:city', name: 'city', valueKind: 'string', directValue: 'Austin' }],
			computed: [
				{
					graphNodeId: 'computed:forecast',
					name: 'forecast',
					async: true,
					...(holds ? { holds: true } : {}),
					dependencies: [{ graphNodeId: 'state:city', path: [] }],
				},
			],
			sharedDefinitions: [],
			storage: [],
		},
		view: {
			version: 1,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			asyncRunners: {},
		},
		root: { nodeType: 1, tagName: 'MAIN', childNodes: [] },
		loadSymbol: () => Promise.reject(new Error('no symbol loads while the graph is built')),
	} as unknown as Parameters<
		typeof import('../src/payload-graph-construct.ts').createRuntimeGraphFromResumePayload
	>[0];
}

test('a payload with async values and no installed plane asks the page loader for it', async () => {
	vi.resetModules();
	const construct = await import('../src/payload-graph-construct.ts');
	const asks: boolean[] = [];
	host.__marklessAsyncPlanes = async (state) => {
		asks.push(state.computed.some((node) => node.holds === true));
		(await import('../src/fns/async-plane.ts')).installMarklessAsyncPlane();
	};
	const graph = await construct.createRuntimeGraphFromResumePayload(payload(true));
	expect(asks).toEqual([true]);
	expect(graph.read('state:city', [])).toBe('Austin');
});

test('with no plane and no loader the build still refuses a payload that carries async values', async () => {
	vi.resetModules();
	const construct = await import('../src/payload-graph-construct.ts');
	await expect(construct.createRuntimeGraphFromResumePayload(payload(false))).rejects.toThrow(
		'MARKLESS_ASYNC_PLANE_MISSING',
	);
});
