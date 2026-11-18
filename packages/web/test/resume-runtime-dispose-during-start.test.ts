import { createRuntimeGraph } from '@markless/runtime';
import { expect, test, vi } from 'vitest';
import { createResumeRuntime } from '../src/index.ts';

// A navigation can dispose a runtime while its start() still awaits a lazy chunk;
// whatever start adds after that must not outlive the dispose.
const gate = vi.hoisted(() => {
	let open = () => {};
	const opened = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { opened, open, requested: false, wired: [] as Array<{ readonly commitArm: (...args: never[]) => Promise<void> }> };
});

vi.mock('../src/resume-branches.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('../src/resume-branches.ts')>();
	gate.requested = true;
	await gate.opened;
	return {
		...original,
		wireBranches: (input: never) => {
			gate.wired.push(input);
			return original.wireBranches(input);
		},
	};
});

type Listener = { readonly type: string; readonly listener: unknown };

function element(tagName: string, childNodes: unknown[] = []) {
	const listeners: Listener[] = [];
	return {
		nodeType: 1,
		tagName,
		childNodes,
		listeners,
		addEventListener(type: string, listener: unknown) {
			listeners.push({ type, listener });
		},
		removeEventListener(type: string, listener: unknown) {
			const index = listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (index >= 0) listeners.splice(index, 1);
		},
		dispatchEvent: () => true,
	};
}

test('dispose during start leaves no listener behind and later arm commits do nothing', async () => {
	const start = { nodeType: 8, data: 'markless:branch:branch-site:0' };
	const end = { nodeType: 8, data: '/markless:branch:branch-site:0' };
	const root = element('DIV', [start, end]);
	const graph = Object.assign(
		createRuntimeGraph({ cells: [{ graphNodeId: 'state:open', value: true }] }),
		{ listSharedDefinitions: () => [{ graphNodeId: 'shared:theme' }] },
	);
	const renderBranchHtml = vi.fn(() => []);
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
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
					takenArm: 1,
					armRecords: [
						{
							locators: [],
							events: [{ hostNodeId: 'h1', eventName: 'keydown', symbolIds: ['symbol:key'] }],
							domUpdates: [],
							behaviors: [],
							elementHandles: [],
						},
						{ locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [] },
					],
				},
			],
		},
		loadSymbol: () => (context: { arm: number }) => ({ arm: context.arm, html: '' }),
		renderBranchHtml,
		applyDomJournal() {},
	} as never);

	const started = resume.start();
	await vi.waitFor(() => expect(gate.requested).toBe(true));
	resume.dispose();
	gate.open();
	await started;
	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(root.listeners).toEqual([]);
	expect(gate.wired).toHaveLength(1);
	const anchors = { id: 'branch-site:0', startAnchor: start, endAnchor: end };
	await expect(
		gate.wired[0]!.commitArm(
			anchors as never,
			{
				html: '<p>late</p>',
				arm: 1,
				armRecords: { locators: [], events: [], behaviors: [], elementHandles: [] },
			} as never,
		),
	).resolves.toBeUndefined();
	expect(renderBranchHtml).not.toHaveBeenCalled();
});
