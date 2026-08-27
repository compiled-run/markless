import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph, type RuntimeGraphInput } from '../src/index.ts';
import { createDerivedReconcilePlane } from '../src/graph-reconcile.ts';

// A resumed page seeds `cells` from the payload, which carries values for state
// cells and none for computed nodes. So a computed starts with no map entry, and
// "never written" has to stay distinguishable from "written undefined": an
// attribute spelled `value ? 'true' : undefined` derives undefined for its normal
// collapsed state, and dropping that first commit drops every DOM update reading it.

const STATE = 'state:open';
const DERIVED = 'computed:aria-expanded';

/** The resume shape: a demand subscription derives and commits with a root write. */
function graphWithDemandCommittedComputed(
	source: unknown,
	derive: (value: never) => unknown,
	reconcile?: RuntimeGraphInput['reconcile'],
) {
	const graph = createGraph({
		cells: [{ graphNodeId: STATE, value: source }],
		computed: [{ graphNodeId: DERIVED, dependencies: [{ graphNodeId: STATE, path: [] }] }],
		...(reconcile ? { reconcile } : {}),
	});
	graph.subscribe({
		id: `sync-computed-demand:${DERIVED}:${STATE}`,
		graphNodeId: STATE,
		path: [],
		run: () => {
			graph.write({ graphNodeId: DERIVED, path: [], value: derive(graph.read(STATE) as never) });
		},
	});
	return graph;
}

for (const [plane, reconcile] of [
	['with the reconcile plane', createDerivedReconcilePlane],
	['without the reconcile plane', undefined],
] as const) {
	test(`${plane}: an unseeded computed committing undefined wakes its subscribers`, async () => {
		const graph = graphWithDemandCommittedComputed(
			true,
			(open: boolean) => (open ? 'true' : undefined),
			reconcile,
		);
		let runs = 0;
		graph.subscribe({
			id: 'view-dom-update:aria-expanded',
			graphNodeId: DERIVED,
			path: [],
			run: () => {
				runs += 1;
			},
		});

		graph.write({ graphNodeId: STATE, path: [], value: false });
		await graph.flush();
		expect(graph.read(DERIVED, [])).toBe(undefined);
		expect(runs).toBe(1);
	});

	test(`${plane}: a seeded computed recommitting the same value wakes nobody`, async () => {
		const graph = graphWithDemandCommittedComputed(
			1,
			(count: number) => (count > 0 ? 'true' : undefined),
			reconcile,
		);
		let runs = 0;
		graph.subscribe({
			id: 'view-dom-update:aria-expanded',
			graphNodeId: DERIVED,
			path: [],
			run: () => {
				runs += 1;
			},
		});

		graph.write({ graphNodeId: STATE, path: [], value: 2 });
		await graph.flush();
		expect(runs).toBe(1);

		// Seeded now, and the derive is unchanged: the guard still holds.
		graph.write({ graphNodeId: STATE, path: [], value: 3 });
		await graph.flush();
		expect(runs).toBe(1);
	});
}

test('a state cell seeded undefined keeps its no-op guard', async () => {
	const graph = createGraph({
		cells: [{ graphNodeId: STATE, value: undefined }],
		reconcile: createDerivedReconcilePlane,
	});
	let runs = 0;
	graph.subscribe({
		id: 'view-dom-update:open',
		graphNodeId: STATE,
		path: [],
		run: () => {
			runs += 1;
		},
	});

	graph.write({ graphNodeId: STATE, path: [], value: undefined });
	await graph.flush();
	expect(runs).toBe(0);
});
