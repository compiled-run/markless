/**
 * The composition side of a branch condition over props.
 *
 * The compiler mints one synthetic computed for a recombined prop test
 * (`@if (count === 0)`), so the branch record reads that node rather than nothing.
 * Two things have to follow from it: composition must keep such a branch in the
 * served payload instead of dropping it as "decided by a static prop", and the
 * child's computed - whose dependencies are prop reads - must re-derive when the
 * parent writes the cell it routed in, so the arm re-decides.
 */
import { createProtocolStatePayload, type ProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessComposeState as composeCsrState, marklessCsrRemapGraphOutput } from '../src/fns/composition.ts';
import { marklessSsrAppendChildView } from '../src/fns/ssr.ts';
import { render } from '../src/render.ts';

const TEST_COMPUTED = 'computed:templateExpression:0';

const emptyChildView = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	keyedRepeats: [],
	branches: [],
	asyncBoundaries: [],
} as const;

function branchRecord(testReads: ReadonlyArray<{ graphNodeId: string; path: ReadonlyArray<string> }>) {
	return {
		id: 'branch-site:0',
		kind: 'if' as const,
		testSource: 'count === 0',
		testReads,
		armChunkIds: ['branch:branch-site:0:arm:0', 'branch:branch-site:0:arm:1'],
		anchorOrder: 0,
		update: 'range' as const,
	};
}

function appendChild(input: {
	readonly testReads: ReadonlyArray<{ graphNodeId: string; path: ReadonlyArray<string> }>;
	readonly graphProps: ReadonlyArray<Record<string, unknown>>;
}) {
	const branches: unknown[] = [];
	marklessSsrAppendChildView({
		child: {
			hostPrefix: 'c0:',
			symbolPrefix: 'c0:',
			boundSymbols: {},
			graphProps: input.graphProps,
			externalSymbolIds: new Set<string>(),
			view: { ...emptyChildView, branches: [branchRecord(input.testReads)] },
		},
		baseIndex: 0,
		locators: [],
		events: [],
		domUpdates: [],
		keyedRepeats: [],
		behaviors: [],
		elementHandles: [],
		branches: branches as never,
		asyncBoundaries: [],
		asyncRunners: {},
		externalSymbolIds: new Set<string>(),
		boundaryArmBranches: new Map(),
	} as never);
	return branches as ReadonlyArray<{ id: string; testReads: ReadonlyArray<{ graphNodeId: string }> }>;
}

test('a branch testing a minted computed survives into the served payload', () => {
	const branches = appendChild({
		testReads: [{ graphNodeId: TEST_COMPUTED, path: [] }],
		graphProps: [{ name: 'count', kind: 'graph-reference', graphNodeId: 'state:n', path: ['v'] }],
	});

	expect(branches).toHaveLength(1);
	expect(branches[0]?.id).toBe('c0:branch-site:0');
	// The child's own node, qualified by the instance path: what the parent writes
	// moves the computed, and the flip reads it back through this id.
	expect(branches[0]?.testReads).toEqual([{ graphNodeId: `c0:${TEST_COMPUTED}`, path: [] }]);
});

// The other direction still holds: a branch whose only read is a prop that was
// never passed live rendered its final arm and has no route to wire.
test('a branch testing a bare prop with no live route is still dropped', () => {
	expect(
		appendChild({
			testReads: [{ graphNodeId: 'prop:props', path: ['count'] }],
			graphProps: [],
		}),
	).toEqual([]);
});

test('a parent write re-derives the child branch computed, so the arm re-decides', async () => {
	const childState = {
		...createProtocolStatePayload({
			cells: [{ graphNodeId: 'prop:props', name: 'props', valueKind: 'object', value: { count: 1 } }],
		}),
		computed: [
			{
				graphNodeId: TEST_COMPUTED,
				name: 'marklessTemplateExpression0',
				async: false,
				deriveSymbolId: 'symbol:branch-test',
				dependencies: [{ graphNodeId: 'prop:props', path: ['count'] }],
			},
		],
	} as ProtocolStatePayload;
	const childOutput: {
		state: ProtocolStatePayload;
		loadSymbol?: (symbolId: string) => unknown;
		m?: (graphProps: unknown, instancePath?: string) => void;
	} = {
		state: childState,
		loadSymbol: (symbolId: string) => {
			if (symbolId !== 'symbol:branch-test') throw new Error(`Unknown symbol ${symbolId}`);
			return ({ graph }: { graph: { read(id: string, path?: ReadonlyArray<string>): unknown } }) =>
				Number(graph.read('prop:props', ['count'])) === 0;
		},
	};
	childOutput.m = (graphProps, instancePath) =>
		marklessCsrRemapGraphOutput(childOutput as never, graphProps as never, instancePath);
	const state = composeCsrState(
		createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:n', name: 'n', valueKind: 'object', value: { v: 1 } }],
		}),
		[
			{
				symbolPrefix: 'c0:',
				graphProps: [{ name: 'count', graphNodeId: 'state:n', path: ['v'] }],
				output: childOutput,
			} as never,
		],
	);
	const root = { nodeType: 1 as const, tagName: 'MAIN', childNodes: [], addEventListener() {} };
	const container = await render(
		() => ({
			root: root as never,
			state,
			view: { ...emptyChildView, keyedRepeats: undefined, branches: undefined } as never,
			loadSymbol: ((symbolId: string) =>
				childOutput.loadSymbol!(symbolId.slice('c0:'.length))) as never,
		}),
		{ target: { replaceChildren() {} } },
	);
	await container.runtime.start?.();

	container.graph.write({ graphNodeId: 'state:n', value: { v: 0 } });
	await container.graph.flush?.();

	// The parent's write reached the child's prop read, so the test now answers
	// the other arm - the re-decision the empty wake set used to make impossible.
	expect(container.graph.read(`c0:${TEST_COMPUTED}`)).toBe(true);

	container.graph.write({ graphNodeId: 'state:n', value: { v: 7 } });
	await container.graph.flush?.();

	expect(container.graph.read(`c0:${TEST_COMPUTED}`)).toBe(false);
});
