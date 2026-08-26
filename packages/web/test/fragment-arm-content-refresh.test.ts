/**
 * A fragment arm renders text with no element of its own to bind to. Its
 * refresh must replace the arm's own marker range and nothing else: bound to
 * the element around the branch it would set that element's text, erasing both
 * markers and whatever the sibling arm had rendered. These pin that a content
 * read re-renders the served arm in place, that it addresses only the branch's
 * anchor pair, and that a branch without such reads wires no subscription.
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

type GraphRead = { readonly source: string; readonly graphNodeId: string; readonly path: [] };

function countRead(): GraphRead {
	return { source: 'count', graphNodeId: 'state:count', path: [] };
}

function branchRuntime(contentReads: ReadonlyArray<GraphRead>) {
	const start = { nodeType: 8, data: 'markless:branch:branch-site:0' };
	const end = { nodeType: 8, data: '/markless:branch:branch-site:0' };
	const root = element('DIV', [start, end]);
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:count', value: 1 },
			{ graphNodeId: 'computed:test', value: true },
		],
	});
	const journal: Array<{ readonly type: string; readonly locator: string }> = [];
	const armCalls: number[] = [];
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
					testReads: [{ source: 'count > 0', graphNodeId: 'computed:test', path: [] }],
					contentReads,
					declaredEmptyArms: [0, 1],
				},
			],
		},
		loadSymbol: () => (context: { arm: number }) => {
			armCalls.push(context.arm);
			return { arm: context.arm, html: '' };
		},
		renderBranchHtml: () => [],
		applyDomJournal(entries: Array<{ readonly type: string; readonly locator: string }>) {
			journal.push(...entries);
		},
	} as never);
	return { resume, graph, journal, armCalls };
}

test('a content read re-renders the served arm inside its own markers', async () => {
	const { resume, graph, journal, armCalls } = branchRuntime([countRead()]);
	await resume.start();

	await graph.write({ graphNodeId: 'state:count', value: 2 });
	await settled();

	expect(armCalls).toEqual([0]);
	expect(journal).toEqual([
		{ type: 'removeRange', locator: 'branch:branch-site:0' },
		{ type: 'insertRange', locator: 'branch:branch-site:0:start', fragment: [] },
	]);
});

// Everything the refresh touches is addressed by the branch's own anchor pair.
test('the refresh addresses only the branch range, never the enclosing element', async () => {
	const { resume, graph, journal } = branchRuntime([countRead()]);
	await resume.start();

	await graph.write({ graphNodeId: 'state:count', value: 3 });
	await settled();

	expect(journal.length).toBe(2);
	expect(journal.every((entry) => entry.locator.startsWith('branch:branch-site:0'))).toBe(true);
	expect(journal.some((entry) => entry.type === 'setText')).toBe(false);
});

test('the content read follows the arm the branch has flipped to', async () => {
	const { resume, graph, journal, armCalls } = branchRuntime([countRead()]);
	await resume.start();

	await graph.write({ graphNodeId: 'computed:test', value: false });
	await settled();
	const afterFlip = journal.length;
	await graph.write({ graphNodeId: 'state:count', value: 9 });
	await settled();

	expect(armCalls).toEqual([1, 1]);
	expect(journal.length).toBe(afterFlip + 2);
});

test('a branch with no content reads wires no extra subscription', async () => {
	const { resume, graph, journal, armCalls } = branchRuntime([]);
	await resume.start();

	await graph.write({ graphNodeId: 'state:count', value: 4 });
	await settled();

	expect(armCalls).toEqual([]);
	expect(journal).toEqual([]);
});
