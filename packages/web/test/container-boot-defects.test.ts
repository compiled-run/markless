import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import type { ProtocolViewPayload } from '@markless/serializer';
import { decodePayloadScripts } from '../src/index.ts';
import { resumeFromPayloadScriptsImpl } from '../src/payload-resume.ts';
import { resumeFromPrerenderRecords } from '../src/fns/prerender-resume.ts';
import { CONTAINER_RETIRE_PROPERTY } from '../src/payload-resume-registry.ts';

// A boot that an in-place navigation outlives must leave the next page's root exactly as the swap left it.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	isConnected: boolean;
	readonly listeners: string[];
	ownerDocument?: unknown;
	addEventListener(type: string): void;
	removeEventListener(type: string): void;
	[key: string]: unknown;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		isConnected: true,
		listeners: [],
		addEventListener(type) {
			this.listeners.push(type);
		},
		removeEventListener(type) {
			const index = this.listeners.indexOf(type);
			if (index >= 0) this.listeners.splice(index, 1);
		},
	};
}

const view: ProtocolViewPayload = {
	version: 1,
	locators: [
		{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
		{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
	],
	events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

const scripts = () =>
	renderPayloadScripts({
		state: createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
		}),
		view,
	});

const container = () => {
	const root = element('SECTION', [element('BUTTON')]);
	root.__mL = {};
	return root;
};

// What the router's in-place swap does: drop the leaving page's `__m*` state and start a new page lifetime.
function swapPage(root: FakeElement): void {
	for (const key of Object.keys(root)) if (key.startsWith('__m')) delete root[key];
	root.__mL = {};
}

const streamedDocument = {
	querySelector: () => ({}),
	querySelectorAll: () => [],
};

test('a prerender-records wake whose page swapped while it adopted streamed patches leaves the new page alone', async () => {
	const root = container();
	const resuming = resumeFromPrerenderRecords({
		root,
		...decodePayloadScripts(scripts()),
		loadSymbol: () => () => {},
	} as never);
	swapPage(root);
	await resuming;
	expect(root.listeners).toEqual([]);
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root.__marklessDispatch).toBeUndefined();
});

test('a boot that the page outlived does not install its retire hook on the new page', async () => {
	const root = container();
	const { stateScript, viewScript } = scripts();
	const resuming = resumeFromPayloadScriptsImpl(
		{ root, stateScript, viewScript, loadSymbol: () => () => {} } as never,
		decodePayloadScripts,
		root.__mL,
	);
	swapPage(root);
	await resuming;
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	expect(root.listeners).toEqual([]);
});

test("a boot that the page outlived does not join the new page's dispatch queue", async () => {
	const root = container();
	const { stateScript, viewScript } = scripts();
	const resuming = resumeFromPayloadScriptsImpl(
		{ root, stateScript, viewScript, loadSymbol: () => () => {} } as never,
		decodePayloadScripts,
		root.__mL,
	);
	swapPage(root);
	const registered: unknown[] = [];
	root.__marklessRegisterDispatch = (dispatch: unknown) => registered.push(dispatch);
	await resuming;
	expect(registered).toEqual([]);
});

test('a boot whose page swapped while the stream-patch module loaded does not mark the new page adopted', async () => {
	const root = container();
	root.ownerDocument = streamedDocument;
	const { stateScript, viewScript } = scripts();
	const resuming = resumeFromPayloadScriptsImpl(
		{ root, stateScript, viewScript, loadSymbol: () => () => {} } as never,
		decodePayloadScripts,
		root.__mL,
	);
	swapPage(root);
	await resuming;
	expect(root.__mAdopted).toBeUndefined();
});

test('a prerender-records wake whose page swapped while the stream-patch module loaded does not mark the new page adopted', async () => {
	const root = container();
	root.ownerDocument = streamedDocument;
	const resuming = resumeFromPrerenderRecords({
		root,
		...decodePayloadScripts(scripts()),
		loadSymbol: () => () => {},
	} as never);
	swapPage(root);
	await resuming;
	expect(root.__mAdopted).toBeUndefined();
});

test('a boot the page did not outlive still resumes, adopts and retires', async () => {
	const root = container();
	root.ownerDocument = streamedDocument;
	const { stateScript, viewScript } = scripts();
	const registered: unknown[] = [];
	root.__marklessRegisterDispatch = (dispatch: unknown) => registered.push(dispatch);
	await resumeFromPayloadScriptsImpl(
		{ root, stateScript, viewScript, loadSymbol: () => () => {} } as never,
		decodePayloadScripts,
		root.__mL,
	);
	expect(root.__mAdopted).toBe(true);
	expect(root.listeners).not.toEqual([]);
	expect(registered).toHaveLength(1);
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
	(root[CONTAINER_RETIRE_PROPERTY] as () => void)();
	expect(root.listeners).toEqual([]);
});
