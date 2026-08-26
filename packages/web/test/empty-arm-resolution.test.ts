/**
 * An arm whose expression evaluates to empty text is a normal render — a toast
 * with no description, say — and the resume runtime must paint it, keep its
 * markers, and refresh it when the value becomes text again. The loud
 * MARKLESS_BRANCH_ARM_EMPTY error is reserved for an arm the update module could
 * not resolve at all, which the module reports structurally: `resolved` is true
 * only when its arm table held parts for the arm it was asked for.
 */
import { createRuntimeGraph } from '@markless/runtime';
import { expect, test } from 'vitest';
import { createResumeRuntime } from '../src/index.ts';

// The branch subscription's run is async, so a write resolves before it lands.
async function settled(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function element(tagName: string, childNodes: unknown[] = []) {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		dispatchedEvents: [] as unknown[],
		listeners: [] as unknown[],
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent: () => true,
	};
}

type Journal = Array<{ readonly type: string; readonly locator: string; readonly fragment?: unknown }>;

/**
 * A branch whose arm 1 is `<>{description}</>`: one read part, so the arm always
 * resolves, and its HTML is whatever the read holds.
 */
function descriptionRuntime(options: { readonly resolves: boolean }) {
	const start = { nodeType: 8, data: 'markless:branch:branch-site:0' };
	const end = { nodeType: 8, data: '/markless:branch:branch-site:0' };
	const root = element('DIV', [start, end]);
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:description', value: 'Saved to drafts' },
			// The `@if (children)` test: no children, so the site sits on arm 1.
			{ graphNodeId: 'computed:children', value: false },
		],
	});
	const journal: Journal = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' }],
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
					testReads: [{ source: 'children', graphNodeId: 'computed:children', path: [] }],
					takenArm: 1,
					contentReads: [
						{ source: 'description', graphNodeId: 'state:description', path: [] },
					],
				},
			],
		},
		loadSymbol: () => (context: { arm: number; graph: { read: (id: string) => unknown } }) => ({
			arm: context.arm,
			html: String(context.graph.read('state:description') ?? ''),
			...(options.resolves ? { resolved: true } : {}),
		}),
		renderBranchHtml: (html: string) => (html ? [{ nodeType: 3, data: html }] : []),
		applyDomJournal(entries: Journal) {
			journal.push(...entries);
		},
	} as never);
	return { resume, graph, journal };
}

test('an arm that resolves to empty text renders empty instead of throwing', async () => {
	const { resume, graph, journal } = descriptionRuntime({ resolves: true });
	await resume.start();

	await graph.write({ graphNodeId: 'state:description', value: '' });
	await settled();

	expect(journal).toEqual([
		{ type: 'removeRange', locator: 'branch:branch-site:0' },
		{ type: 'insertRange', locator: 'branch:branch-site:0:start', fragment: [] },
	]);
});

test('an arm that resolved empty refreshes to text and back to empty', async () => {
	const { resume, graph, journal } = descriptionRuntime({ resolves: true });
	await resume.start();

	await graph.write({ graphNodeId: 'state:description', value: '' });
	await settled();
	await graph.write({ graphNodeId: 'state:description', value: 'Undo available' });
	await settled();
	const afterText = journal.at(-1);

	await graph.write({ graphNodeId: 'state:description', value: '' });
	await settled();

	expect(afterText).toEqual({
		type: 'insertRange',
		locator: 'branch:branch-site:0:start',
		fragment: [{ nodeType: 3, data: 'Undo available' }],
	});
	// Back to empty: still the branch's own anchor pair, still no throw.
	expect(journal.at(-1)).toEqual({
		type: 'insertRange',
		locator: 'branch:branch-site:0:start',
		fragment: [],
	});
	expect(journal.every((entry) => entry.locator.startsWith('branch:branch-site:0'))).toBe(true);
});

test('an arm the update could not resolve still fails loudly', async () => {
	const { resume, graph, journal } = descriptionRuntime({ resolves: false });
	await resume.start();

	graph.write({ graphNodeId: 'state:description', value: '' });

	// The flush the write scheduled carries the throw; awaiting it here is what
	// keeps this rejection from landing as an unhandled one.
	await expect(graph.flush()).rejects.toMatchObject({
		code: 'MARKLESS_BRANCH_ARM_EMPTY',
		branchId: 'branch-site:0',
		arm: 1,
	});
	expect(journal).toEqual([]);
});
