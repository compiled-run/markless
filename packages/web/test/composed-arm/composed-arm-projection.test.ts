/**
 * The route an `@if` arm's own projection of a composed prop travels.
 *
 * A dom update takes its value from the record, which composition rewrites to
 * the caller's node. An arm takes its value from the branch-update symbol's own
 * read of the part-local prop id, and nothing rewrites that - so the served
 * branch record carries the child's route table and instance path, and resume
 * answers the symbol's prop reads through them.
 */
import { expect, test } from 'vitest';
import { marklessCsrRemapChildGraph } from '../../src/fns/composition.ts';
import { marklessSsrAppendChildView } from '../../src/fns/ssr.ts';
import { composedBranchGraph } from '../../src/resume-branches.ts';

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

const CHILDREN_READ = { source: 'children', graphNodeId: 'prop:props', path: ['children'] };

type ServedBranch = {
	readonly id: string;
	readonly composedInstancePath?: string;
	readonly composedGraphProps?: ReadonlyArray<{
		readonly name: string;
		readonly graphNodeId: string;
		readonly path?: ReadonlyArray<string>;
	}>;
};

function appendChild(input: {
	readonly branch: Record<string, unknown>;
	readonly graphProps: ReadonlyArray<Record<string, unknown>>;
	readonly symbolPrefix?: string;
}): ReadonlyArray<ServedBranch> {
	const branches: unknown[] = [];
	marklessSsrAppendChildView({
		child: {
			hostPrefix: input.symbolPrefix ?? 'c0:',
			symbolPrefix: input.symbolPrefix ?? 'c0:',
			boundSymbols: {},
			graphProps: input.graphProps,
			externalSymbolIds: new Set<string>(),
			view: { ...emptyChildView, branches: [input.branch] },
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
	return branches as ReadonlyArray<ServedBranch>;
}

test('a composed branch carries the child route table its arm symbol reads', () => {
	const [branch] = appendChild({
		branch: {
			id: 'branch-site:0',
			symbolId: 'symbol:0',
			testReads: [CHILDREN_READ],
			contentReads: [CHILDREN_READ],
		},
		graphProps: [
			{ name: 'children', kind: 'graph-reference', graphNodeId: 'state:caption', path: [] },
			// Passed statically: the part already rendered its final value, so the
			// table has no route to offer and never lists the name.
			{ name: 'tone', kind: 'literal', value: 'quiet' },
		],
	});

	expect(branch?.composedInstancePath).toBe('c0:');
	expect(branch?.composedGraphProps).toEqual([{ name: 'children', graphNodeId: 'state:caption' }]);
});

test('a composed branch with no live prop route carries neither field', () => {
	const [branch] = appendChild({
		branch: {
			id: 'branch-site:0',
			symbolId: 'symbol:0',
			testReads: [{ source: 'open', graphNodeId: 'computed:0', path: [] }],
		},
		graphProps: [],
	});

	expect(branch).toBeDefined();
	expect(branch).not.toHaveProperty('composedInstancePath');
	expect(branch).not.toHaveProperty('composedGraphProps');
});

test('a table routed at a deeper compose travels this level as a read does', () => {
	const [branch] = appendChild({
		branch: {
			id: 'c0:branch-site:0',
			symbolId: 'c0:symbol:0',
			testReads: [{ source: 'children', graphNodeId: 'prop:props', path: ['label'] }],
			composedInstancePath: 'c0:',
			composedGraphProps: [{ name: 'children', graphNodeId: 'prop:props', path: ['label'] }],
		},
		graphProps: [
			{ name: 'label', kind: 'graph-reference', graphNodeId: 'state:caption', path: [] },
		],
		symbolPrefix: 'p1:',
	});

	// The path accumulates outward and the route lands on the page's own cell.
	expect(branch?.composedInstancePath).toBe('p1:c0:');
	expect(branch?.composedGraphProps).toEqual([{ name: 'children', graphNodeId: 'state:caption' }]);
});

// Prop NAMES are module-local, so a deeper part's `children` and this child's
// `children` are different props; claiming the deeper branch with this child's
// table would answer its arm with an unrelated value.
test('this child does not claim a branch a deeper compose authored', () => {
	const [branch] = appendChild({
		branch: {
			id: 'c0:branch-site:0',
			symbolId: 'c0:symbol:0',
			testReads: [{ source: 'open', graphNodeId: 'computed:0', path: [] }],
		},
		graphProps: [
			{ name: 'children', kind: 'graph-reference', graphNodeId: 'state:caption', path: [] },
		],
	});

	expect(branch).toBeDefined();
	expect(branch).not.toHaveProperty('composedGraphProps');
});

function recordReads(branch: Record<string, unknown>) {
	const asked: Array<readonly [string, ReadonlyArray<string> | undefined]> = [];
	const base = {
		read: (graphNodeId: string, path?: ReadonlyArray<string>) => {
			asked.push([graphNodeId, path]);
			return 'read';
		},
	};
	return { asked, graph: composedBranchGraph(base as never, branch as never), base };
}

test('the record graph answers a scoped prop read with the caller node', () => {
	const { asked, graph } = recordReads({
		composedInstancePath: 'c0:p1:',
		composedGraphProps: [{ name: 'children', graphNodeId: 'state:caption' }],
	});

	// Resume scopes the symbol before it runs, so the prop id arrives carrying
	// the instance path; `prop:` is not page space, so taking it off is exact.
	graph.read('c0:p1:prop:props', ['children']);
	// A name the table lists no route for was passed statically, and anything
	// that is not a prop read is already page space by the time it gets here.
	graph.read('c0:p1:prop:props', ['tone']);
	graph.read('c0:p1:cell:other', []);

	expect(asked).toEqual([
		['state:caption', []],
		['c0:p1:prop:props', ['tone']],
		['c0:p1:cell:other', []],
	]);
});

test('a record with no route table is handed the page graph untouched', () => {
	const { graph, base } = recordReads({});
	expect(graph).toBe(base);
});

// The two ends of one route: the table `fns/composition.ts` builds for a dom
// update, and the table `ssr.ts` serves for the arm symbol that reads the same
// prop. The resume core cannot import the compose path - it would drag the
// whole of it into the static closure resume is held under - so this is what
// keeps the reader beside `wireBranches` answering what composition decided.
test('the served table answers a prop read the way composition rewrites one', () => {
	const graphProps = [
		{ name: 'children', kind: 'graph-reference', graphNodeId: 'state:caption', path: ['text'] },
	];
	for (const path of [['children'], ['children', 'length']]) {
		const [branch] = appendChild({
			branch: {
				id: 'branch-site:0',
				symbolId: 'symbol:0',
				testReads: [{ source: 'children', graphNodeId: 'prop:props', path }],
			},
			graphProps,
		});
		const { asked, graph } = recordReads(branch as never);
		graph.read(`c0:prop:props`, path);

		expect(asked).toEqual([
			[
				marklessCsrRemapChildGraph({ graphNodeId: 'prop:props', path }, graphProps)!.graphNodeId,
				marklessCsrRemapChildGraph({ graphNodeId: 'prop:props', path }, graphProps)!.path,
			],
		]);
	}
});
