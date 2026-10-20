import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/index.ts';
import {
	PROTOCOL_EVENT_HOST_ATTRIBUTE,
	PROTOCOL_SYNC_POLICY_TABLE_TYPE,
} from '@markless/serializer/protocol';
import {
	createInlineResumerSource,
	INLINE_MODULE_LOADER_SOURCE,
	INLINE_RESUMER_PAGE_TOKEN,
	renderInlineResumerPageSource,
} from '../src/inline/resumer.ts';
import {
	createSyncPolicyTable,
	inlineResumerPage,
	withEventHostMarks,
} from '../src/render-to-string.ts';

const bootTail = `(${INLINE_MODULE_LOADER_SOURCE},${INLINE_RESUMER_PAGE_TOKEN});`;

test.each(['click', 'keydown'])(
	'inline capture retains a %s stop across module loading',
	async (type) => {
		const source = createInlineResumerSource({
			debug: false,
			executionLog: 'never',
			graphSyncPolicy: false,
			resumeModuleUrl: '/build/resume.js',
			sharedGraphPolicy: false,
			syncPolicy: true,
		});
		const inputs: Array<{ propagationStopped?: boolean }> = [];
		let finishLoad!: () => void;
		const load = () =>
			new Promise((resolve) => {
				finishLoad = () =>
					resolve({
						resumeContainerEvent(input: { propagationStopped?: boolean }) {
							inputs.push(input);
						},
					});
			});
		const listeners = new Map<string, (event: unknown) => void>();
		const view = {
			asyncBoundaries: [],
			locators: [{ hostNodeId: 'h0', index: 1 }],
			events: [
				{
					hostNodeId: 'h0',
					eventName: type,
					symbolIds: ['run'],
					syncPolicy: {
						branches: [
							{
								when: { type: 'constant-truthy', value: true },
								actions: ['stopPropagation'],
							},
						],
					},
				},
			],
		};
		const policyTable = createSyncPolicyTable();
		const served = withEventHostMarks(view as never, '<button></button>', policyTable);
		const mark =
			new RegExp(`${PROTOCOL_EVENT_HOST_ATTRIBUTE}="([^"]*)"`).exec(served)?.[1] ?? null;
		const root = {
			addEventListener: (name: string, listener: (event: unknown) => void) =>
				listeners.set(name, listener),
			removeEventListener: () => {},
			querySelector: (selector: string) =>
				selector === `script[type="${PROTOCOL_SYNC_POLICY_TABLE_TYPE}"]`
					? { textContent: JSON.stringify(policyTable.policies) }
					: null,
		};
		const host = {
			tagName: 'BUTTON',
			parentElement: root,
			getAttribute: (name: string) => (name === PROTOCOL_EVENT_HOST_ATTRIBUTE ? mark : null),
		};
		const document = {
			currentScript: { closest: () => root, getAttribute: () => null },
			createTreeWalker: () => {
				let done = false;
				return {
					nextNode: () => {
						if (done) return null;
						done = true;
						return host;
					},
				};
			},
		};
		expect(source).toContain(bootTail);
		const runnable = renderInlineResumerPageSource(
			source.replace(bootTail, `(__load,${INLINE_RESUMER_PAGE_TOKEN});`),
			inlineResumerPage(view as never),
		);
		new Function('document', 'addEventListener', '__load', runnable)(document, () => {}, load);
		const event = {
			type,
			target: host,
			cancelBubble: false,
			stopPropagation() {
				this.cancelBubble = true;
			},
		};
		listeners.get(type)!(event);
		expect(event.cancelBubble).toBe(true);
		event.cancelBubble = false;
		finishLoad();
		for (let i = 0; i < 8; i++) await Promise.resolve();
		expect(inputs).toHaveLength(1);
		expect(inputs[0]?.propagationStopped).toBe(true);
	},
);

test('full dispatch honors a captured stop after the native flag is cleared', async () => {
	type Node = { nodeType: 1; tagName: string; childNodes: Node[]; parentElement?: Node | null };
	const child: Node = { nodeType: 1, tagName: 'BUTTON', childNodes: [], parentElement: null };
	const parent: Node = {
		nodeType: 1,
		tagName: 'SECTION',
		childNodes: [child],
		parentElement: null,
	};
	const root: Node = { nodeType: 1, tagName: 'MAIN', childNodes: [parent] };
	child.parentElement = parent;
	parent.parentElement = root;
	const runs: string[] = [];
	const runtime = createResumeRuntime({
		root: root as never,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'parent', strategy: 'dom-order', index: 1, tagName: 'section' },
				{ hostNodeId: 'child', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{ hostNodeId: 'parent', eventName: 'click', symbolIds: ['parent'] },
				{ hostNodeId: 'child', eventName: 'click', symbolIds: ['child'] },
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol: (id) => () => {
			runs.push(id);
		},
	});
	await runtime.start();
	await runtime.dispatch({ type: 'click', target: child, cancelBubble: false } as never, {
		propagationStopped: true,
	});
	expect(runs).toEqual(['child']);
});
