import { expect, test } from 'vitest';
import { marklessComposeState as csrComposeState } from '../src/fns/composition.ts';
import { marklessComposeState as ssrComposeState } from '../src/fns/ssr.ts';

// Composition qualifies an imported child's graph node ids with the instance
// path its symbols already carry, so two instances of one component (and a page
// and a child sharing a name) own separate nodes. A child declared in the SAME
// module has no instance path — its symbols are indistinguishable at resume —
// so its ids still merge unqualified and compose must refuse loudly.

function pageState(nodes: { cells?: string[]; computed?: string[] }) {
	return {
		version: 1,
		cells: (nodes.cells ?? []).map((graphNodeId) => ({ graphNodeId })),
		computed: (nodes.computed ?? []).map((graphNodeId) => ({ graphNodeId })),
	};
}

function child(nodes: Parameters<typeof pageState>[0], symbolPrefix = '') {
	return { symbolPrefix, output: { state: pageState(nodes) } };
}

function graphNodeIds(composed: unknown): string[] {
	const state = composed as {
		cells: ReadonlyArray<{ graphNodeId: string }>;
		computed: ReadonlyArray<{ graphNodeId: string }>;
	};
	return [...state.cells, ...state.computed].map((node) => node.graphNodeId);
}

const EXPECTED_MESSAGE =
	'MARKLESS_COMPOSED_STATE_COLLISION: Two components declared in the same module both declare state() or computed() named "report". Components declared in the same module as the page share one state graph, so they would read and write the same value. Move one into its own module or rename it.';

for (const [label, composeState] of [
	['SSR', ssrComposeState],
	['CSR', csrComposeState],
] as const) {
	test(`${label} compose qualifies a composed component's ids against a same-named page node`, () => {
		const composed = composeState(pageState({ computed: ['computed:report'] }), [
			child({ computed: ['computed:report'] }, 'c0:'),
		]);
		expect(graphNodeIds(composed)).toEqual(['computed:report', 'c0:computed:report']);
	});

	test(`${label} compose gives two instances of one component distinct state ids`, () => {
		const composed = composeState(pageState({ cells: ['state:page'] }), [
			child({ cells: ['state:report'] }, 'c0:'),
			child({ cells: ['state:report'] }, 'c1:'),
		]);
		expect(graphNodeIds(composed)).toEqual([
			'state:page',
			'c0:state:report',
			'c1:state:report',
		]);
	});

	test(`${label} compose separates compiler-synthesized ids per instance`, () => {
		// Anonymous template expressions mint computed:templateExpression:N in
		// EVERY module, so an unqualified merge shared one node (and one runner)
		// across instances. The instance path separates them without renaming.
		const composed = composeState(pageState({ computed: ['computed:templateExpression:0'] }), [
			child({ computed: ['computed:templateExpression:0'] }, 'c0:'),
			child({ computed: ['computed:templateExpression:0'] }, 'c1:'),
		]);
		expect(graphNodeIds(composed)).toEqual([
			'computed:templateExpression:0',
			'c0:computed:templateExpression:0',
			'c1:computed:templateExpression:0',
		]);
	});

	test(`${label} compose keeps shared-definition ids page-global under an instance path`, () => {
		const composed = composeState(
			pageState({
				cells: ['state:page', 'shared:lib/session.ts#useSession/state:user'],
				computed: ['computed:summary'],
			}),
			[
				child(
					{
						cells: [
							'state:report',
							// The SAME shared definition referenced by page and child is
							// one graph node by design — never instance-qualified.
							'shared:lib/session.ts#useSession/state:user',
						],
						computed: ['computed:crop'],
					},
					'c0:',
				),
			],
		);
		expect(graphNodeIds(composed)).toEqual([
			'state:page',
			'shared:lib/session.ts#useSession/state:user',
			'c0:state:report',
			'shared:lib/session.ts#useSession/state:user',
			'computed:summary',
			'c0:computed:crop',
		]);
	});

	test(`${label} compose refuses loudly when a same-module component collides on a name`, () => {
		expect(() =>
			composeState(pageState({ computed: ['computed:report'] }), [
				child({ computed: ['computed:report'] }),
			]),
		).toThrowError(EXPECTED_MESSAGE);
		expect(() =>
			composeState(pageState({ cells: ['state:page'] }), [
				child({ cells: ['state:report'] }),
				child({ cells: ['state:report'] }),
			]),
		).toThrowError(EXPECTED_MESSAGE);
	});
}
