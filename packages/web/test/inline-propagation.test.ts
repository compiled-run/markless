import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/index.ts';
import { createInlineResumerSource } from '../src/inline/resumer.ts';

const loaderTail = '((url) => import(/* @vite-ignore */ url));';

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
		const root = {
			addEventListener: (name: string, listener: (event: unknown) => void) =>
				listeners.set(name, listener),
			removeEventListener: () => {},
			querySelector: (selector: string) =>
				selector === 'script[type="markless/view"]'
					? {
							textContent: JSON.stringify({
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
							}),
						}
					: null,
		};
		const host = { tagName: 'BUTTON', parentElement: root };
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
		expect(source).toContain(loaderTail);
		new Function('document', '__load', source.replace(loaderTail, '(__load);'))(document, load);
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
