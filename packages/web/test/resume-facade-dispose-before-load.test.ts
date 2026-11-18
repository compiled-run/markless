import { expect, test, vi } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createResumeRuntime } from '../src/resume.ts';
import type { ResumeDomElement } from '../src/resume-types.ts';

const runtimeModule = vi.hoisted(() => {
	let release!: () => void;
	const loaded = new Promise<void>((resolve) => (release = resolve));
	return { loaded, release };
});

vi.mock('../src/resume-runtime.ts', async (importOriginal) => {
	await runtimeModule.loaded;
	return importOriginal();
});

function resumeOnRoot() {
	const button: ResumeDomElement = { nodeType: 1, tagName: 'BUTTON' };
	const live = new Set<unknown>();
	const root = {
		nodeType: 1 as const,
		tagName: 'MAIN',
		childNodes: [button],
		contains: (target: ResumeDomElement) => target === button,
		addEventListener: (type: string, listener: unknown) => live.add(listener),
		removeEventListener: (type: string, listener: unknown) => live.delete(listener),
	};
	const handler = vi.fn();
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({
			cells: [],
			sharedDefinitions: [
				{
					id: 'session',
					name: 'session',
					exportedName: 'session',
					scope: 'app',
					version: 0,
					graphNodeIds: [],
				},
			],
		}),
		view: {
			locators: [
				{ hostNodeId: 'button', strategy: 'dom-order', index: 1, tagName: 'BUTTON' },
			],
			events: [{ hostNodeId: 'button', eventName: 'click', symbolIds: ['press'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol: () => handler,
	});
	return { resume, button, live, handler };
}

test('a resume disposed while its runtime module loads leaves no listeners and ignores later clicks', async () => {
	const { resume, button, live, handler } = resumeOnRoot();
	const started = resume.start();
	resume.dispose();
	runtimeModule.release();
	await started;

	expect(live.size).toBe(0);
	await resume.dispatch({ type: 'click', target: button });
	expect(handler).not.toHaveBeenCalled();
});

test('the same resume left running listens on its root and runs the click', async () => {
	const { resume, button, live, handler } = resumeOnRoot();
	runtimeModule.release();
	await resume.start();

	expect(live.size).toBeGreaterThan(0);
	await resume.dispatch({ type: 'click', target: button });
	expect(handler).toHaveBeenCalledTimes(1);
	resume.dispose();
	expect(live.size).toBe(0);
});

test('a resume disposed before it starts stays disposed when started and clicked', async () => {
	const { resume, button, live, handler } = resumeOnRoot();
	resume.dispose();
	await resume.start();
	await resume.dispatch({ type: 'click', target: button });

	expect(live.size).toBe(0);
	expect(handler).not.toHaveBeenCalled();
});
