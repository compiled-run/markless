import { createRuntimeGraph } from '@markless/runtime';
import { expect, test, vi } from 'vitest';
import { createResumeRuntime } from '../src/index.ts';

// A container torn down while its journal listener waits on code has nothing left to draw into.
const gate = vi.hoisted(() => {
	let open = () => {};
	const opened = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { armed: false, waiting: false, opened, open };
});

vi.mock('../src/resume-branches.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/resume-branches.ts')>();
	return {
		...original,
		wireBranches: (input: never) => {
			const wired = original.wireBranches(input);
			return {
				...wired,
				async disposeRemovedRangeHosts(...args: Parameters<typeof wired.disposeRemovedRangeHosts>) {
					if (gate.armed) {
						gate.waiting = true;
						await gate.opened;
					}
					return wired.disposeRemovedRangeHosts(...args);
				},
			};
		},
	};
});

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

test('a journal whose container was torn down while it waited is not applied', async () => {
	const start = { nodeType: 8, data: 'markless:branch:branch-site:0' };
	const end = { nodeType: 8, data: '/markless:branch:branch-site:0' };
	const root = element('SECTION', [element('P'), start, end]);
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] });
	const applied: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			domUpdates: [
				{ hostNodeId: 'h1', source: 'count', graphNodeId: 'state:count', path: [], symbolId: 'symbol:text' },
			],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			branches: [
				{
					id: 'branch-site:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:branch',
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
					takenArm: 0,
					armRecords: [{ locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [] }],
				},
			],
		},
		loadSymbol: () => ({ graph: runtimeGraph }: { graph: typeof graph }) => ({
			type: 'setText',
			locator: 'h1:text',
			value: runtimeGraph.read('state:count'),
		}),
		applyDomJournal(entries: unknown[]) {
			applied.push(...entries);
		},
	} as never);
	await resume.start();

	gate.armed = true;
	graph.write({ graphNodeId: 'state:count', value: 1 });
	const flushed = graph.flush();
	await vi.waitFor(() => expect(gate.waiting).toBe(true));
	resume.dispose();
	gate.open();
	await flushed;

	expect(applied).toEqual([]);
});
