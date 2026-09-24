import { expect, test, vi } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/resume.ts';
import type { ResumeDomElement } from '../src/resume-types.ts';

test.each(['BUTTON', 'INPUT'])(
	'resumed %s interactions avoid unrelated subtree reads',
	async (tagName) => {
		let reads = 0;
		const control: ResumeDomElement = { nodeType: 1, tagName };
		const unrelated: ResumeDomElement = { nodeType: 1, tagName: 'ASIDE' };
		const children = [unrelated, control];
		const contains = vi.fn((target: ResumeDomElement) => children.includes(target));
		const root = {
			nodeType: 1 as const,
			tagName: 'MAIN',
			contains,
			get childNodes() {
				reads++;
				return children;
			},
		};
		const handler = vi.fn();
		const runtime = createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [{ hostNodeId: 'control', strategy: 'dom-order', index: 2, tagName }],
				events: [{ hostNodeId: 'control', eventName: 'click', symbolIds: ['press'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
			loadSymbol: () => handler,
		});
		reads = 0;
		expect(runtime.getElement('control')).toBe(control);
		expect(reads).toBe(0);
		await runtime.start();
		for (let action = 1; action <= 2; action++) {
			reads = 0;
			await runtime.dispatch({ type: 'click', target: control });
			expect(runtime.getElement('control')).toBe(control);
			expect(handler).toHaveBeenCalledTimes(action);
			expect(reads).toBe(0);
		}
		children.pop();
		expect(runtime.getElement('control')).toBeUndefined();
		await expect(runtime.dispatch({ type: 'click', target: control })).rejects.toMatchObject({
			code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		});
		expect(handler).toHaveBeenCalledTimes(2);
	},
);
