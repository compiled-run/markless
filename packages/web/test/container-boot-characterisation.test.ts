import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import type { ProtocolViewPayload } from '@markless/serializer';
import { decodePayloadScripts } from '../src/index.ts';
import { disposeResumedPayload } from '../src/payload-full.ts';
import { resumeFromPayloadScriptsImpl } from '../src/payload-resume.ts';
import { resumeFromPrerenderRecords } from '../src/fns/prerender-resume.ts';
import {
	CONTAINER_RETIRE_PROPERTY,
	getAlreadyResumedPayload,
	getRetiredResumedPayload,
	wakeNoopResume,
} from '../src/payload-resume-registry.ts';

// Pins what a container root looks like at every step of its boot lifecycle: wake, join, live, outlived, refused, retired, disposed, re-woken.

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	isConnected: boolean;
	readonly listeners: string[];
	onListen?: () => void;
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
			const listen = this.onListen;
			this.onListen = undefined;
			listen?.();
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

const BOOT_LISTENERS = ['click', 'focusin', 'pointerover'];

function container(): FakeElement {
	const root = element('SECTION', [element('BUTTON')]);
	root.__mL = {};
	return root;
}

function swapPage(root: FakeElement): void {
	for (const key of Object.keys(root)) if (key.startsWith('__m')) delete root[key];
	root.__mL = {};
}

const wake = (root: FakeElement, stateScript = scripts().stateScript) =>
	resumeFromPayloadScriptsImpl(
		{
			root,
			stateScript,
			viewScript: scripts().viewScript,
			loadSymbol: () => () => {},
		} as never,
		decodePayloadScripts,
		root.__mL,
	);

const wakeRecords = (root: FakeElement) =>
	resumeFromPrerenderRecords({
		root,
		...decodePayloadScripts(scripts()),
		loadSymbol: () => () => {},
	} as never);

const retire = (root: FakeElement) => (root[CONTAINER_RETIRE_PROPERTY] as () => void)();

function joinQueue(
	root: FakeElement,
): Array<(handoff: unknown, fallback: () => string) => unknown> {
	const registered: Array<(handoff: unknown, fallback: () => string) => unknown> = [];
	root.__marklessRegisterDispatch = (dispatch: never) => registered.push(dispatch);
	return registered;
}

const click = (root: FakeElement) => ({ event: { type: 'click', target: root } });

test('a first wake writes nothing to the root until its start settles, then goes live', async () => {
	const root = container();
	const registered = joinQueue(root);
	const booting = wake(root);
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	expect(root.__marklessDispatch).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	const result = await booting;
	expect(result.warnings).toBeUndefined();
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(typeof root.__marklessDispatch).toBe('function');
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
	expect(root.__marklessEventOnlyGraph).toBeInstanceOf(Map);
	expect(registered).toHaveLength(1);
	const live = getAlreadyResumedPayload(root as never);
	expect(live?.runtime).toBe(result.runtime);
	expect(live?.graph).toBe(result.graph);
	expect(live?.warnings?.map((warning) => warning.code)).toEqual([
		'MARKLESS_RESUME_ALREADY_RESUMED',
	]);
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
});

test('a wake while the boot is in flight joins the same boot', async () => {
	const root = container();
	const registered = joinQueue(root);
	const first = wake(root);
	const second = wake(root);
	const [a, b] = await Promise.all([first, second]);
	expect(b).toBe(a);
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(registered).toHaveLength(1);
});

test('a prerender-records wake joins a payload boot already in flight on the same root', async () => {
	const root = container();
	const [a, b] = await Promise.all([wake(root), wakeRecords(root)]);
	expect(b.runtime).toBe(a.runtime);
	expect(root.listeners).toEqual(BOOT_LISTENERS);
});

test('a prerender-records boot goes live without joining the dispatch queue', async () => {
	const root = container();
	const registered = joinQueue(root);
	const result = await wakeRecords(root);
	expect(registered).toEqual([]);
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(typeof root.__marklessDispatch).toBe('function');
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(result.runtime);
});

test('a boot keeps a dispatch authority the root already has', async () => {
	const root = container();
	const existing = () => {};
	root.__marklessDispatch = existing;
	await wake(root);
	expect(root.__marklessDispatch).toBe(existing);
});

test('the queued dispatch reaches the live runtime and falls back once the root is disposed', async () => {
	const root = container();
	const registered = joinQueue(root);
	await wake(root);
	await registered[0]!(click(root), () => 'fallback');
	let fellBack = 0;
	await registered[0]!(click(root), () => String(++fellBack));
	expect(fellBack).toBe(0);
	disposeResumedPayload(root as never);
	expect(registered[0]!(click(root), () => 'fallback')).toBe('fallback');
});

test('a boot the page outlived returns its runtime but writes nothing and stays unfiled', async () => {
	const root = container();
	const registered = joinQueue(root);
	const booting = wake(root);
	swapPage(root);
	root.__marklessRegisterDispatch = (dispatch: never) => registered.push(dispatch);
	const result = await booting;
	expect(result.runtime).toBeDefined();
	expect(result.warnings).toBeUndefined();
	expect(root.listeners).toEqual([]);
	expect(registered).toEqual([]);
	expect(root.__marklessDispatch).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	expect(root.__marklessEventOnlyGraph).toBeUndefined();
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
});

test('a start that refuses after the page swapped resolves quietly and writes nothing', async () => {
	const root = container();
	root.onListen = () => {
		swapPage(root);
		throw new Error('refused');
	};
	const result = await wake(root);
	expect(result.runtime).toBeDefined();
	expect(root.listeners).toEqual([]);
	expect(root.__marklessDispatch).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
});

test('a start that refuses on the current page rejects, keeps its retire hook, and the next wake boots again', async () => {
	const root = container();
	root.onListen = () => {
		throw new Error('refused');
	};
	await expect(wake(root)).rejects.toThrow('refused');
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	expect(root.__marklessDispatch).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
	expect(root.__marklessEventOnlyGraph).toBeInstanceOf(Map);
	const result = await wake(root);
	expect(result.warnings).toBeUndefined();
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(result.runtime);
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
});

test('a payload that fails to decode rejects and the next wake boots again', async () => {
	const root = container();
	await expect(
		wake(root, '<script type="markless/state">{"version":1,"cells":"x"}</script>'),
	).rejects.toThrow();
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
	expect(root.__marklessEventOnlyGraph).toBeUndefined();
	const result = await wake(root);
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(result.runtime);
});

test('a retire hook called mid-start followed by a swap leaves the boot unfiled', async () => {
	const root = container();
	root.onListen = () => {
		retire(root);
		swapPage(root);
	};
	await wake(root);
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect(root.__marklessDispatch).toBeUndefined();
	expect(root[CONTAINER_RETIRE_PROPERTY]).toBeUndefined();
});

test('a retire hook called mid-start without a swap does not stop the boot from going live', async () => {
	const root = container();
	root.onListen = () => retire(root);
	const result = await wake(root);
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(result.runtime);
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(typeof root.__marklessDispatch).toBe('function');
});

test('a second wake on a live root answers already-resumed without booting again', async () => {
	const root = container();
	const registered = joinQueue(root);
	const first = await wake(root);
	const second = await wake(root);
	const third = await wakeRecords(root);
	for (const again of [second, third]) {
		expect(again.runtime).toBe(first.runtime);
		expect(again.graph).toBe(first.graph);
		expect(again.warnings).toEqual([
			{
				code: 'MARKLESS_RESUME_ALREADY_RESUMED',
				severity: 'warning',
				phase: 'resume',
				title: 'This container was already resumed',
				message: 'resumeFromPayloadDocument was called again on an already live container.',
				why: 'Resume attaches graph and event wiring once per payload container.',
				suggestions: [
					{
						message:
							'Resume each served container once, or dispose before resuming again.',
					},
				],
				docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED',
			},
		]);
	}
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(registered).toHaveLength(1);
});

test('a live root that a swap did not retire still answers already-resumed on the new page', async () => {
	const root = container();
	const first = await wake(root);
	swapPage(root);
	const again = await wake(root);
	expect(again.runtime).toBe(first.runtime);
	expect(again.warnings).toHaveLength(1);
	expect(root.__marklessDispatch).toBeUndefined();
});

test('dispose stops the runtime and clears the started flag and event-only graph, keeping dispatch and the retire hook', async () => {
	const root = container();
	await wake(root);
	const dispatch = root.__marklessDispatch;
	disposeResumedPayload(root as never);
	expect(root.listeners).toEqual([]);
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBeUndefined();
	expect('__marklessEventOnlyGraph' in root).toBe(false);
	expect(root.__marklessDispatch).toBe(dispatch);
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
	disposeResumedPayload(root as never);
	expect(root.listeners).toEqual([]);
});

test('the retire hook stops the runtime and files the root as disposed, leaving the started flag', async () => {
	const root = container();
	const first = await wake(root);
	retire(root);
	expect(root.listeners).toEqual([]);
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(root.__marklessEventOnlyGraph).toBeInstanceOf(Map);
	root.isConnected = false;
	const retired = getRetiredResumedPayload(root as never);
	expect(retired?.graph).toBe(first.graph);
	expect(retired?.decoded).toBe(first.decoded);
	await expect(retired?.runtime.dispatch(click(root).event as never)).resolves.toBeUndefined();
});

test('a wake after dispose on a connected root boots a new runtime and keeps the first dispatch authority', async () => {
	const root = container();
	const first = await wake(root);
	const dispatch = root.__marklessDispatch;
	disposeResumedPayload(root as never);
	const second = await wake(root);
	expect(second.runtime).not.toBe(first.runtime);
	expect(second.warnings).toBeUndefined();
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(root.__marklessDispatch).toBe(dispatch);
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(second.runtime);
});

test('a wake after dispose on a detached root answers with the disposed result and a no-op dispatch', async () => {
	const root = container();
	const first = await wake(root);
	disposeResumedPayload(root as never);
	root.isConnected = false;
	const again = await wake(root);
	expect(again.graph).toBe(first.graph);
	expect(again.runtime).not.toBe(first.runtime);
	await expect(again.runtime.dispatch(click(root).event as never)).resolves.toBeUndefined();
	expect(root.listeners).toEqual([]);
	const records = await wakeRecords(root);
	expect(records.graph).toBe(first.graph);
});

test('a detached root keeps its disposed answer while a re-boot is in flight, then answers no-op once it lands', async () => {
	const root = container();
	const first = await wake(root);
	disposeResumedPayload(root as never);
	const reboot = wake(root);
	root.isConnected = false;
	expect(getRetiredResumedPayload(root as never)?.graph).toBe(first.graph);
	const second = await reboot;
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(second.runtime);
	expect(getRetiredResumedPayload(root as never)).toBe(wakeNoopResume);
});

test('a failed re-boot keeps the disposed answer for a detached root', async () => {
	const root = container();
	const first = await wake(root);
	disposeResumedPayload(root as never);
	root.onListen = () => {
		throw new Error('refused');
	};
	await expect(wake(root)).rejects.toThrow('refused');
	root.isConnected = false;
	expect(getRetiredResumedPayload(root as never)?.graph).toBe(first.graph);
});

test('a detached root that never went live answers no-op only when a wake claimed it', () => {
	const root = container();
	root.isConnected = false;
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
	root.__asyncResumeRuntimeStarted = true;
	expect(getRetiredResumedPayload(root as never)).toBe(wakeNoopResume);
	root.isConnected = true;
	expect(getRetiredResumedPayload(root as never)).toBeUndefined();
});

test('a wake whose caller saw an older page lifetime is a no-op and boots nothing', async () => {
	const root = container();
	const result = await resumeFromPayloadScriptsImpl(
		{ root, ...scripts(), loadSymbol: () => () => {} } as never,
		decodePayloadScripts,
		{},
	);
	expect(result).toBe(wakeNoopResume);
	expect(root.listeners).toEqual([]);
	expect(getAlreadyResumedPayload(root as never)).toBeUndefined();
	const booted = await wake(root);
	expect(booted.warnings).toBeUndefined();
});

test('a new page lifetime starts a fresh boot while the outlived one is in flight, and the outlived one cannot displace it', async () => {
	const root = container();
	const outlived = wake(root);
	swapPage(root);
	const registered = joinQueue(root);
	const current = wake(root);
	const [a, b] = await Promise.all([outlived, current]);
	expect(b.runtime).not.toBe(a.runtime);
	expect(b.warnings).toBeUndefined();
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(b.runtime);
	expect(root.listeners).toEqual(BOOT_LISTENERS);
	expect(registered).toHaveLength(1);
	expect(root.__asyncResumeRuntimeStarted).toBe(true);
	expect(typeof root[CONTAINER_RETIRE_PROPERTY]).toBe('function');
});

test('a wake after a swap during a refused boot boots the new page', async () => {
	const root = container();
	root.onListen = () => {
		swapPage(root);
		throw new Error('refused');
	};
	await wake(root);
	const result = await wake(root);
	expect(result.warnings).toBeUndefined();
	expect(getAlreadyResumedPayload(root as never)?.runtime).toBe(result.runtime);
	expect(root.listeners).toEqual(BOOT_LISTENERS);
});
