import { expect, test } from 'vitest';
import { marklessComposeState as csrComposeState } from '../src/fns/csr.ts';
import { marklessComposeState as ssrComposeState } from '../src/fns/ssr.ts';

// Graph node ids are NAME-based per module (state:report, computed:report),
// and compose merges child state into ONE page graph without prefixing. A
// page and a composed component (or two composed component instances)
// declaring the same state()/computed() name would silently read and write
// each other's values — the streaming runner registry would even dedupe two
// DIFFERENT async computeds into one run. Compose must refuse loudly (D2)
// in author vocabulary until instance-scoped graph ids exist.

function pageState(nodes: { cells?: string[]; computed?: string[] }) {
	return {
		version: 1,
		cells: (nodes.cells ?? []).map((graphNodeId) => ({ graphNodeId })),
		computed: (nodes.computed ?? []).map((graphNodeId) => ({ graphNodeId })),
	};
}

function child(nodes: Parameters<typeof pageState>[0]) {
	return { output: { state: pageState(nodes) } };
}

const EXPECTED_MESSAGE =
	'MARKLESS_COMPOSED_STATE_COLLISION: Two components on this page both declare state() or computed() named "report". Composed components share one state graph, so they would read and write the same value. Rename one of them.';

for (const [label, composeState] of [
	['SSR', ssrComposeState],
	['CSR', csrComposeState],
] as const) {
	test(`${label} compose refuses loudly when a page and a composed component declare the same computed name`, () => {
		expect(() =>
			composeState(pageState({ computed: ['computed:report'] }), [
				child({ computed: ['computed:report'] }),
			]),
		).toThrowError(EXPECTED_MESSAGE);
	});

	test(`${label} compose refuses loudly when two composed components collide on a state name`, () => {
		expect(() =>
			composeState(pageState({ cells: ['state:page'] }), [
				child({ cells: ['state:report'] }),
				child({ cells: ['state:report'] }),
			]),
		).toThrowError(EXPECTED_MESSAGE);
	});

	test(`${label} compose leaves compiler-synthesized ids alone (authors cannot rename them)`, () => {
		// Anonymous template expressions mint computed:templateExpression:N in
		// EVERY module — almost any composed page repeats them. The diagnostic
		// covers author-renamable state()/computed() names only; synthesized-id
		// sharing stays the ledgered instance-scoped-graph-ids follow-on.
		const composed = composeState(pageState({ computed: ['computed:templateExpression:0'] }), [
			child({ computed: ['computed:templateExpression:0'] }),
		]) as { computed: ReadonlyArray<unknown> };
		expect(composed.computed).toHaveLength(2);
	});

	test(`${label} compose keeps distinct names and shared-definition ids composable`, () => {
		const composed = composeState(
			pageState({
				cells: ['state:page', 'shared:lib/session.ts#useSession/state:user'],
				computed: ['computed:summary'],
			}),
			[
				child({
					cells: [
						'state:report',
						// The SAME shared definition referenced by page and child is
						// one graph node by design — never a collision.
						'shared:lib/session.ts#useSession/state:user',
					],
					computed: ['computed:crop'],
				}),
			],
		) as { cells: ReadonlyArray<unknown>; computed: ReadonlyArray<unknown> };
		expect(composed.cells).toHaveLength(4);
		expect(composed.computed).toHaveLength(2);
	});
}
