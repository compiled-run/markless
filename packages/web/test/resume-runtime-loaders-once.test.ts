import { createRuntimeGraph } from '@markless/runtime';
import { expect, test, vi } from 'vitest';
import { createResumeRuntime } from '../src/index.ts';

// Two callers asking for a lazily built runtime at once must share the one the first started.
const built = vi.hoisted(() => ({
	events: 0,
	behaviors: 0,
	branches: 0,
	active: new Set<string>(),
	failActivation: 0,
	loaders: undefined as
		| undefined
		| {
				readonly getEvents: () => Promise<unknown>;
				readonly loadBehaviorRuntime: () => Promise<unknown>;
				readonly loadBranchRuntime: () => Promise<unknown>;
		  },
}));

vi.mock('../src/resume-events.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/resume-events.ts')>();
	return {
		...original,
		createEventWiring: (input: Parameters<typeof original.createEventWiring>[0]) => {
			built.events++;
			return original.createEventWiring(input);
		},
	};
});

vi.mock('../src/resume-behaviors.ts', () => ({
	createBehaviorRuntime: () => {
		built.behaviors++;
		return {
			activateBehaviors: async (hostNodeId: string) => {
				await new Promise((resolve) => setTimeout(resolve, 0));
				if (built.failActivation > 0 && built.failActivation--) throw new Error('activation failed');
				built.active.add(hostNodeId);
			},
			addBehaviorRecords() {},
			behaviorHostIdsForAncestors: () => [],
			observesVisible: () => false,
			disposeBehaviorHost() {},
			disconnect() {},
		};
	},
}));

vi.mock('../src/resume-branches.ts', () => ({
	wireBranches: () => {
		built.branches++;
		return { branchesById: new Map(), startupArmBehaviorHostIds: ['h-arm'] };
	},
}));

vi.mock('../src/resume-runtime-start.ts', () => ({
	startResumeRuntime: async (input: NonNullable<typeof built.loaders>) => {
		built.loaders = input;
		return () => undefined;
	},
}));

function element(tagName: string, childNodes: unknown[] = []) {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent: () => true,
	};
}

async function loaders() {
	const resume = createResumeRuntime({
		root: element('DIV'),
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			branches: [
				{
					id: 'branch-site:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:branch',
					testReads: [],
					takenArm: 0,
					armRecords: [
						{
							locators: [],
							events: [],
							domUpdates: [],
							behaviors: [{ hostNodeId: 'h-arm', symbolId: 'symbol:behavior', reads: [] }],
							elementHandles: [],
						},
					],
				},
			],
		},
		loadSymbol: () => () => undefined,
		renderBranchHtml: () => [],
		applyDomJournal() {},
	} as never);
	await resume.start();
	return built.loaders!;
}

test('two first calls of each runtime loader build one runtime, and both see startup arm behaviours active', async () => {
	const { getEvents, loadBehaviorRuntime, loadBranchRuntime } = await loaders();

	const [firstEvents, secondEvents] = await Promise.all([getEvents(), getEvents()]);
	expect(secondEvents).toBe(firstEvents);
	expect(built.events).toBe(1);

	const [firstBehaviors, secondBehaviors] = await Promise.all([loadBehaviorRuntime(), loadBehaviorRuntime()]);
	expect(secondBehaviors).toBe(firstBehaviors);
	expect(built.behaviors).toBe(1);

	const sawActive: boolean[] = [];
	const [firstBranches, secondBranches] = await Promise.all(
		[loadBranchRuntime(), loadBranchRuntime()].map((load) =>
			load.then((runtime) => {
				sawActive.push(built.active.has('h-arm'));
				return runtime;
			}),
		),
	);
	expect(secondBranches).toBe(firstBranches);
	expect(built.branches).toBe(1);
	expect(sawActive).toEqual([true, true]);
});

test('a branch runtime asked for twice at once builds its behaviour runtime once', async () => {
	built.events = built.behaviors = built.branches = 0;
	built.active.clear();
	const { loadBranchRuntime } = await loaders();
	await Promise.all([loadBranchRuntime(), loadBranchRuntime()]);
	expect(built.behaviors).toBe(1);
	expect(built.branches).toBe(1);
});

test('a startup arm behaviour that fails to activate is retried without wiring branches again', async () => {
	built.events = built.behaviors = built.branches = 0;
	built.active.clear();
	built.failActivation = 1;
	const { loadBranchRuntime } = await loaders();
	await expect(loadBranchRuntime()).rejects.toThrow('activation failed');
	const runtime = await loadBranchRuntime();
	expect(built.branches).toBe(1);
	expect(built.active.has('h-arm')).toBe(true);
	expect(await loadBranchRuntime()).toBe(runtime);
});
