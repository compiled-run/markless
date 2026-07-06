import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createProtocolStatePayload } from '@markless/serializer';
import {
	applyDomJournalEntries,
	createResumeRuntime,
	createRuntimeGraphFromResumePayload,
	RuntimeResumeError,
} from '../src/index.ts';
import type { RuntimeGraph, RuntimeGraphWrite } from '@markless/runtime';
import type {
	DomJournalEntry,
	ResumeEventRecord,
	ResumeKeyedRepeatRowEvent,
	ResumeViewRecord,
} from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeNode[];
	parentElement?: FakeElement | null;
	readonly dispatchedEvents: FakeDispatchedEvent[];
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void>;
		readonly options?: { readonly capture?: boolean };
	}>;
	addEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	): void;
	removeEventListener?(
		type: string,
		listener: (event: FakeEvent) => Promise<void>,
		options?: { readonly capture?: boolean },
	): void;
	dispatchEvent(event: FakeDispatchedEvent): boolean;
};

type FakeComment = {
	readonly nodeType: 8;
	readonly data: string;
};

type FakeNode = FakeElement | FakeComment;

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly key: string;
	defaultPrevented: boolean;
	propagationStopped: boolean;
	preventDefault(): void;
	stopPropagation(): void;
};

type FakeDispatchedEvent = {
	readonly type: string;
	readonly detail?: unknown;
	readonly bubbles?: boolean;
	readonly cancelable?: boolean;
	readonly composed?: boolean;
};

function element(tagName: string, childNodes: FakeNode[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		dispatchedEvents: [],
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
		removeEventListener(type, listener) {
			const index = this.listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (index >= 0) this.listeners.splice(index, 1);
		},
		dispatchEvent(event) {
			this.dispatchedEvents.push(event);
			return true;
		},
	};
	for (const child of childNodes) {
		if (child.nodeType === 1) child.parentElement = node;
	}
	return node;
}

function comment(data: string): FakeComment {
	return {
		nodeType: 8,
		data,
	};
}

function event(type: string, target: FakeElement, key: string): FakeEvent {
	return {
		type,
		target,
		key,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
	};
}

function syncComputedPayloads() {
	return {
		state: {
			...createProtocolStatePayload({
				cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 2 }],
			}),
			computed: [{
				graphNodeId: 'computed:doubled', name: 'doubled', async: false,
				deriveSymbolId: 'symbol:derive',
				dependencies: [{ graphNodeId: 'state:count', path: [] }],
			}],
		},
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'output' },
			],
			events: [],
			domUpdates: [{
				hostNodeId: 'h1', source: 'doubled', graphNodeId: 'computed:doubled',
				path: [], target: { kind: 'text' }, symbolId: 'symbol:text',
			}],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
	} as const;
}

async function settleMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

test('resume runtime selects switch arms by case tests when seeding and flipping', async () => {
	const startAnchor = { nodeType: 8 as const, textContent: 'markless:branch:branch-site:0' };
	const armNode = {
		nodeType: 1 as const,
		tagName: 'P',
		childNodes: [],
		addEventListener() {},
	};
	const endAnchor = { nodeType: 8 as const, textContent: '/markless:branch:branch-site:0' };
	const children = [startAnchor, armNode, endAnchor] as Array<Record<string, unknown>>;
	const root = {
		nodeType: 1 as const,
		tagName: 'MAIN',
		childNodes: children,
		addEventListener() {},
	};
	for (const child of children) child.parentNode = root;
	let kind = 'b';
	const subscriptions: Array<{ run(): unknown }> = [];
	const graph = {
		read: () => kind,
		subscribe(subscription: { run(): unknown }) {
			subscriptions.push(subscription);
			return () => undefined;
		},
		subscribeJournal: () => () => undefined,
		listSharedDefinitions: () => [],
		flush: async () => undefined,
	};
	const loaded: string[] = [];
	const applied: unknown[] = [];
	const runtime = createResumeRuntime({
		root: root as never,
		graph: graph as never,
		view: {
			locators: [],
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
					symbolId: 'symbol:flip',
					armTests: ['a', 'b', null],
					testReads: [{ source: 'kind', graphNodeId: 'state:kind', path: [] }],
				},
			],
		} as never,
		loadSymbol(symbolId: string) {
			loaded.push(symbolId);
			return () => ({ arm: 2, html: '<p>D</p>' });
		},
		applyDomJournal: (entries) => {
			applied.push(...entries);
		},
	});
	await runtime.start();

	// Seed: kind 'b' selects arm 1 by case tests, not truthiness (which would
	// give arm 0 for any truthy string).
	expect(loaded).toEqual([]);

	// Writing another matching case value that maps to the SAME arm is a no-op.
	kind = 'b';
	await subscriptions[0]!.run();
	expect(loaded).toEqual([]);

	// A non-matching value falls to @default (arm 2) and flips.
	kind = 'zzz';
	const entries = (await subscriptions[0]!.run()) as unknown[];
	expect(loaded).toEqual(['symbol:flip']);
	expect(entries).toHaveLength(2);
});

test('resume runtime skips tagName validation for wildcard locators', () => {
	const child = { nodeType: 1, tagName: 'ARTICLE', childNodes: [], addEventListener() {} };
	const root = {
		nodeType: 1,
		tagName: 'MAIN',
		childNodes: [child],
		addEventListener() {},
	};
	const runtime = createResumeRuntime({
		root: root as never,
		graph: {
			read: () => undefined,
			write: () => undefined,
			subscribe: () => () => undefined,
			subscribeJournal: () => () => undefined,
			flush: async () => undefined,
		} as never,
		view: {
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: '*' }],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		} as never,
		loadSymbol: () => () => undefined,
	});

	expect(runtime.getElement('h0')).toBe(child);
});

test('resume payload sync computed derives after dependency writes and updates DOM sites', async () => {
	const output = element('OUTPUT');
	const root = element('SECTION', [output]);
	const { state, view } = syncComputedPayloads();
	const loadedSymbols: string[] = [];
	const appliedEntries: unknown[] = [];
	const loadSymbol = (symbolId: string) => {
		loadedSymbols.push(symbolId);
		if (symbolId === 'symbol:derive') {
			return ({ graph: runtimeGraph }) => Number(runtimeGraph.read('state:count')) * 2;
		}
		return (context) => ({
			type: 'setText',
			locator: context.domUpdate?.hostNodeId ?? 'h1',
			value: context.value,
		});
	};
	const graph = await createRuntimeGraphFromResumePayload({
		state,
		view,
		root,
		loadSymbol,
	});

	const runtime = createResumeRuntime({
		root,
		graph,
		state,
		view,
		loadSymbol,
		applyDomJournal(entries) {
			appliedEntries.push(...entries);
		},
	});
	await runtime.start();

	graph.write({ graphNodeId: 'state:count', value: 3 });
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:derive', 'symbol:text']);
	expect(graph.read('computed:doubled')).toBe(6);
	expect(appliedEntries).toEqual([{ type: 'setText', locator: 'h1', value: 6 }]);

	loadedSymbols.length = 0;
	runtime.dispose();
	graph.write({ graphNodeId: 'state:count', value: 4 });
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(graph.read('computed:doubled')).toBe(6);
});

test('resume runtime materializes view records and dispatches lazy symbols after sync policy', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true, title: 'Menu' } }],
	});
	const loadedSymbols: string[] = [];

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
		path: ['open'],
		run(value) {
			return { type: 'setAttr', locator: 'input:open', name: 'data-open', value };
		},
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'keydown',
					syncPolicy: {
						when: {
							type: 'and',
							conditions: [
								{ type: 'graph-truthy', graphNodeId: 'state:menu', path: ['open'] },
								{ type: 'event-equals', field: 'key', value: 'Escape' },
							],
						},
						actions: ['preventDefault', 'stopPropagation'],
					},
					symbolIds: ['symbol:key'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:menu',
					path: ['open'],
					value: false,
				});
			};
		},
	});

	await resume.start();

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'keydown',
			options: { capture: true },
		}),
	]);

	const keydown = event('keydown', input, 'Escape');
	const dispatch = root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(keydown.propagationStopped).toBe(true);

	await dispatch;

	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(graph.read('state:menu', ['open'])).toBe(false);
	expect(graph.takeJournal()).toEqual([
		{ type: 'setAttr', locator: 'input:open', name: 'data-open', value: false },
	]);
});

test('resume runtime dispatches versioned shared patches after lazy event writes', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				value: {
					status: 'anonymous',
				},
			},
		],
		sharedDefinitions: [
			{
				id: 'shared:src/session.tsrx#session',
				name: 'session',
				exportedName: 'session',
				scope: 'page',
				version: 0,
				graphNodeIds: ['shared:src/session.tsrx#session/state:data'],
				returnProperties: [
					{
						kind: 'graph',
						name: 'status',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['status'],
					},
				],
			},
		],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:ready'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ graph: runtimeGraph }) => {
				runtimeGraph.writeShared({
					definitionId: 'shared:src/session.tsrx#session',
					propertyName: 'status',
					value: 'ready',
				});
			};
		},
	});

	await resume.start();
	await root.listeners[0].listener(event('click', button, ''));

	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('ready');
	expect(graph.takeSharedPatches()).toEqual([]);
	expect(root.dispatchedEvents).toHaveLength(1);
	expect(root.dispatchedEvents[0]).toEqual(
		expect.objectContaining({
			type: 'async:shared-patch',
			detail: {
				id: 'shared:src/session.tsrx#session',
				scope: 'page',
				version: 1,
				patch: [['set', ['status'], 'ready']],
			},
			bubbles: true,
			cancelable: false,
			composed: true,
		}),
	);
});

test('resume runtime folds received shared patch events into graph state', async () => {
	const root = element('SECTION');
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				value: {
					status: 'anonymous',
				},
			},
		],
		sharedDefinitions: [
			{
				id: 'shared:src/session.tsrx#session',
				name: 'session',
				exportedName: 'session',
				scope: 'page',
				version: 0,
				graphNodeIds: ['shared:src/session.tsrx#session/state:data'],
				returnProperties: [
					{
						kind: 'graph',
						name: 'status',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['status'],
					},
				],
			},
		],
	});
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return () => undefined;
		},
	});

	await resume.start();

	const patchListener = root.listeners.find((listener) => listener.type === 'async:shared-patch');
	expect(patchListener).toBeDefined();
	await patchListener?.listener({
		type: 'async:shared-patch',
		detail: {
			id: 'shared:src/session.tsrx#session',
			scope: 'page',
			version: 1,
			patch: [['set', ['status'], 'ready']],
		},
		bubbles: true,
		cancelable: false,
		composed: true,
	} as never);

	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('ready');
	expect(graph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			version: 1,
		}),
	);
	expect(graph.takeSharedPatches()).toEqual([]);
	expect(root.dispatchedEvents).toEqual([]);
});

test('resume runtime can skip sync policy already applied by the inline resumer', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({ cells: [] });
	const loadedSymbols: string[] = [];
	let preventDefaultCalls = 0;

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					syncPolicy: {
						when: { type: 'constant-truthy', value: true },
						actions: ['preventDefault'],
					},
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => {};
		},
	});
	const click = event('click', button, '');
	click.preventDefault = () => {
		preventDefaultCalls++;
		click.defaultPrevented = true;
	};

	await resume.dispatch(click, { syncPolicyAlreadyApplied: true });

	expect(preventDefaultCalls).toBe(0);
	expect(click.defaultPrevented).toBe(false);
	expect(loadedSymbols).toEqual(['symbol:click']);
});

test('resume runtime activates element behaviors once on ordinary event triggers', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({ cells: [] });
	const loadedSymbols: string[] = [];
	const installed: string[] = [];
	const handled: string[] = [];
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'tooltip(options)',
					functionSource: 'tooltip',
					inputSources: ['options'],
					inputValues: [{ placement: 'top' }],
					symbolId: 'symbol:tooltip',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:tooltip') {
				return ({ element: host, behaviorInputs }) => {
					installed.push(`${host.tagName}:${JSON.stringify(behaviorInputs ?? [])}`);
					return () => cleanups.push('tooltip');
				};
			}

			return () => {
				handled.push(symbolId);
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);

	await root.listeners[0].listener(event('click', button, ''));
	await root.listeners[0].listener(event('click', button, ''));

	expect(loadedSymbols).toEqual(['symbol:tooltip', 'symbol:click', 'symbol:click']);
	expect(installed).toEqual(['BUTTON:[{"placement":"top"}]']);
	expect(handled).toEqual(['symbol:click', 'symbol:click']);

	resume.disposeHost('h1');

	expect(cleanups).toEqual(['tooltip']);
});

test('resume runtime startup installs container wiring without importing app symbols', async () => {
	const button = element('BUTTON');
	const image = element('IMG');
	const canvas = element('CANVAS');
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [button, image, canvas, start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const observed: FakeElement[] = [];
	const result = deferred<string>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return result.promise;
				},
			},
		],
	});
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'img' },
				{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'canvas' },
				{ hostNodeId: 'h4', strategy: 'dom-order', index: 4, tagName: 'p' },
			],
			events: [
				{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] },
				{ hostNodeId: 'h2', eventName: 'visible', symbolIds: ['symbol:visible'] },
			],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h3',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'details.title',
							graphNodeId: 'computed:details',
							path: [],
							runnerSymbolId: 'symbol:details-runner',
						},
					],
				},
			],
		},
		createVisibilityObserver() {
			return {
				observe(target) {
					observed.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'click',
			options: { capture: true },
		}),
	]);
	expect(observed).toEqual([image]);
	expect(loadedSymbols).toEqual([]);
	expect(graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	await graph.flush();
	expect(loadedSymbols).toEqual([]);
});

test('resume runtime applies DOM journal entries after dispatch-owned graph flushes', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:menu', value: { open: true } }],
	});
	const appliedEntries: unknown[] = [];

	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:menu',
		path: ['open'],
		run(value) {
			return { type: 'setAttr', locator: 'input:open', name: 'data-open', value };
		},
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:toggle'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:menu',
					path: ['open'],
					value: false,
				});
			};
		},
		applyDomJournal(entries) {
			appliedEntries.push(...entries);
		},
	});

	await resume.start();
	await root.listeners[0].listener(event('click', input, ''));

	expect(appliedEntries).toEqual([
		{ type: 'setAttr', locator: 'input:open', name: 'data-open', value: false },
	]);
	expect(graph.takeJournal()).toEqual([]);
});

test('resume runtime evaluates constant sync policy guards before lazy symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'keydown',
					syncPolicy: {
						when: {
							type: 'and',
							conditions: [
								{ type: 'constant-truthy', value: true },
								{ type: 'event-equals', field: 'key', value: 'Escape' },
							],
						},
						actions: ['preventDefault'],
					},
					symbolIds: ['symbol:key'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	const keydown = event('keydown', input, 'Escape');
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
});

test('resume runtime evaluates sync policy branches independently before lazy symbols', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({
			cells: [{ graphNodeId: 'state:menu', value: { open: true, locked: true } }],
		}),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'keydown',
					syncPolicy: {
						branches: [
							{
								when: {
									type: 'and',
									conditions: [
										{
											type: 'graph-truthy',
											graphNodeId: 'state:menu',
											path: ['open'],
										},
										{ type: 'event-equals', field: 'key', value: 'Escape' },
									],
								},
								actions: ['preventDefault'],
							},
							{
								when: {
									type: 'and',
									conditions: [
										{
											type: 'graph-truthy',
											graphNodeId: 'state:menu',
											path: ['locked'],
										},
										{ type: 'event-equals', field: 'key', value: 'Enter' },
									],
								},
								actions: ['stopPropagation'],
							},
						],
					},
					symbolIds: ['symbol:first', 'symbol:second'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	const escape = event('keydown', input, 'Escape');
	await root.listeners[0].listener(escape);

	expect(escape.defaultPrevented).toBe(true);
	expect(escape.propagationStopped).toBe(false);

	const enter = event('keydown', input, 'Enter');
	await root.listeners[0].listener(enter);

	expect(enter.defaultPrevented).toBe(false);
	expect(enter.propagationStopped).toBe(true);
	expect(loadedSymbols).toEqual([
		'symbol:first',
		'symbol:second',
		'symbol:first',
		'symbol:second',
	]);
});

test('resume runtime dispatches delegated events from nested targets to the owner element record', async () => {
	const label = element('SPAN');
	const button = element('BUTTON', [label]);
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	const handledElements: string[] = [];

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'span' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return ({ element: ownerElement, graph: runtimeGraph }) => {
				handledElements.push(ownerElement.tagName);
				runtimeGraph.update({
					graphNodeId: 'state:count',
					update: (value) => Number(value) + 1,
				});
			};
		},
	});

	await resume.start();

	const click = event('click', label, '');
	await root.listeners[0].listener(click);

	expect(handledElements).toEqual(['BUTTON']);
	expect(graph.read('state:count')).toBe(1);
});

test('resume runtime materializes container-offset fragment sibling roots and dispatches events on the second sibling', async () => {
	const header = element('HEADER');
	const button = element('BUTTON');
	// Container shape produced by renderToString for a fragment-rooted
	// component: the container div directly holds the concatenated sibling
	// roots, so the container is walk-element 0 and the siblings are 1 and 2.
	const root = element('DIV', [header, button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	const loadedSymbols: string[] = [];
	const handledElements: string[] = [];

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'header' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ element: ownerElement, graph: runtimeGraph }) => {
				handledElements.push(ownerElement.tagName);
				runtimeGraph.update({
					graphNodeId: 'state:count',
					update: (value) => Number(value) + 1,
				});
			};
		},
	});

	await resume.start();

	expect(resume.getElement('h0')).toBe(header);
	expect(resume.getElement('h1')).toBe(button);

	await root.listeners[0].listener(event('click', button, ''));

	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(handledElements).toEqual(['BUTTON']);
	expect(graph.read('state:count')).toBe(1);
});

test('resume runtime reports structured errors for mismatched DOM-order locators', () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const error = captureThrown(() =>
		createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
			loadSymbol() {
				return () => undefined;
			},
		}),
	);

	expect(error).toBeInstanceOf(RuntimeResumeError);
	expect(error).toMatchObject({
		code: 'MARKLESS_RESUME_LOCATOR_MISMATCH',
		message: 'Resume locator h1 expected <button> at DOM order index 1 but found <input>.',
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISMATCH',
	});
});

test('resume runtime reports structured errors for missing async boundary anchors', async () => {
	const start = comment('async:boundary:0:start');
	const root = element('SECTION', [start]);

	await expect(async () => {
		const resume = createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [
					{
						id: 'boundary:0',
						startAnchor: {
							strategy: 'dom-order-comment',
							index: 0,
						},
						endAnchor: {
							strategy: 'dom-order-comment',
							index: 1,
						},
						asyncReads: [],
					},
				],
			},
			loadSymbol() {
				return () => undefined;
			},
		});
		await resume.start();
	}).rejects.toMatchObject({
		code: 'MARKLESS_RESUME_LOCATOR_MISSING',
		docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_LOCATOR_MISSING',
		message: 'Resume locator boundary:0 endAnchor expected a comment at DOM order index 1.',
	});
});

test('resume runtime invalidates disposed host locators and delegated event records', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:click'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(resume.getElement('h1')).toBe(button);

	resume.disposeHost('h1');

	expect(resume.getElement('h1')).toBeUndefined();

	await root.listeners[0].listener(event('click', button, ''));

	expect(loadedSymbols).toEqual([]);
});

test('resume runtime exposes element handles to lazy symbols by handle id and local name', async () => {
	const input = element('INPUT');
	const button = element('BUTTON');
	const root = element('SECTION', [input, button]);
	const resolvedHandles: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h2',
					eventName: 'click',
					symbolIds: ['symbol:focus'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [
				{ hostNodeId: 'h1', handleId: 'handle:search', name: 'searchInput' },
				{ hostNodeId: 'missing-host', handleId: 'handle:missing', name: 'missingInput' },
			],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				resolvedHandles.push(context.getElementHandle('handle:search')?.tagName);
				resolvedHandles.push(context.getElementHandle('searchInput')?.tagName);
				resolvedHandles.push(context.getElementHandle('handle:missing'));
				resolvedHandles.push(context.getElementHandle('missingInput'));
			};
		},
	});

	await resume.start();
	await root.listeners[0].listener(event('click', button, ''));

	expect(resolvedHandles).toEqual(['INPUT', 'INPUT', undefined, undefined]);
});

test('resume runtime returns undefined for element handles after host disposal', async () => {
	const input = element('INPUT');
	const button = element('BUTTON');
	const root = element('SECTION', [input, button]);
	const resolvedHandles: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h2',
					eventName: 'click',
					symbolIds: ['symbol:focus'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [{ hostNodeId: 'h1', handleId: 'handle:search', name: 'searchInput' }],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				resolvedHandles.push(context.getElementHandle('handle:search'));
				resolvedHandles.push(context.getElementHandle('searchInput'));
			};
		},
	});

	await resume.start();
	resume.disposeHost('h1');
	await root.listeners[0].listener(event('click', button, ''));

	expect(resolvedHandles).toEqual([undefined, undefined]);
});

test('resume runtime returns undefined for detached element handles', async () => {
	const input = element('INPUT');
	const button = element('BUTTON');
	const root = element('SECTION', [input, button]);
	const resolvedHandles: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h2',
					eventName: 'click',
					symbolIds: ['symbol:focus'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [{ hostNodeId: 'h1', handleId: 'handle:search', name: 'searchInput' }],
			asyncBoundaries: [],
		},
		loadSymbol() {
			return (context) => {
				resolvedHandles.push(resume.getElement('h1'));
				resolvedHandles.push(context.getElementHandle('handle:search'));
				resolvedHandles.push(context.getElementHandle('searchInput'));
			};
		},
	});

	await resume.start();
	input.parentElement = null;
	(root.childNodes as FakeNode[]).splice(root.childNodes.indexOf(input), 1);
	await root.listeners[0].listener(event('click', button, ''));

	expect(resolvedHandles).toEqual([undefined, undefined, undefined]);
});

test('resume runtime wires onVisible through a shared observer and runs cleanup once', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	const cleanups: string[] = [];
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'visible',
					symbolIds: ['symbol:first', 'symbol:second'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe(target) {
					observed.push(target);
				},
				unobserve(target) {
					unobserved.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => () => cleanups.push(symbolId);
		},
	});

	await resume.start();

	expect(root.listeners).toEqual([]);
	expect(observed).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: false }]);
	expect(loadedSymbols).toEqual([]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();
	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);
	expect(unobserved).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();
	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);

	resume.disposeHost('h1');

	expect(cleanups).toEqual(['symbol:second', 'symbol:first']);
});

test('resume runtime visible symbols read current graph values without subscribing', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:title', value: 'initial' }],
	});
	const seenTitles: unknown[] = [];
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'visible', symbolIds: ['symbol:visible'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe() {},
				unobserve() {},
			};
		},
		loadSymbol() {
			return ({ read }) => {
				seenTitles.push(read?.('state:title', []));
			};
		},
	});

	await resume.start();
	graph.write({ graphNodeId: 'state:title', value: 'visible-title' });
	await graph.flush();

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();

	expect(seenTitles).toEqual(['visible-title']);

	graph.write({ graphNodeId: 'state:title', value: 'later-title' });
	await graph.flush();
	await settleMicrotasks();

	expect(seenTitles).toEqual(['visible-title']);
});

test('resume runtime activates element behaviors on visible triggers', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	const installed: string[] = [];
	const cleanups: string[] = [];
	const visibleRan = deferred<void>();
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'visible',
					symbolIds: ['symbol:visible'],
				},
			],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					inputValues: [{ color: 'red' }],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe(target) {
					observed.push(target);
				},
				unobserve(target) {
					unobserved.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:chart') {
				return ({ element: host, behaviorInputs }) => {
					installed.push(`${host.tagName}:${JSON.stringify(behaviorInputs ?? [])}`);
					return () => cleanups.push('behavior');
				};
			}

			return () => {
				visibleRan.resolve();
				return () => cleanups.push('visible');
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);
	expect(observed).toEqual([canvas]);

	visibilityCallback?.([{ target: canvas, isIntersecting: true }]);
	await visibleRan.promise;
	await settleMicrotasks();

	expect(unobserved).toEqual([canvas]);
	expect(loadedSymbols).toHaveLength(2);
	expect(loadedSymbols).toEqual(expect.arrayContaining(['symbol:chart', 'symbol:visible']));
	expect(installed).toEqual(['CANVAS:[{"color":"red"}]']);

	resume.disposeHost('h1');

	expect(cleanups).toHaveLength(2);
	expect(new Set(cleanups)).toEqual(new Set(['behavior', 'visible']));
});

test('resume runtime cleans behavior and visible cleanups when an observed host is removed', async () => {
	const canvas = element('CANVAS');
	const root = element('SECTION', [canvas]);
	const loadedSymbols: string[] = [];
	const cleanups: string[] = [];
	const observedRemovals: Array<{
		readonly target: FakeElement;
		readonly options?: { readonly childList?: boolean; readonly subtree?: boolean };
	}> = [];
	const visibleRan = deferred<void>();
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	let removalCallback:
		| ((
				records: ReadonlyArray<{
					readonly removedNodes: ReadonlyArray<FakeNode>;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'canvas' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'visible', symbolIds: ['symbol:visible'] }],
			domUpdates: [],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart(config)',
					functionSource: 'chart',
					inputSources: ['config'],
					inputValues: [{ color: 'red' }],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe() {},
				unobserve() {},
			};
		},
		createRemovalObserver(callback) {
			removalCallback = callback;
			return {
				observe(target, options) {
					observedRemovals.push({ target, options });
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:chart') {
				return () => () => cleanups.push('behavior');
			}

			return () => {
				visibleRan.resolve();
				return () => cleanups.push('visible');
			};
		},
	});

	await resume.start();

	expect(observedRemovals).toEqual([
		{ target: root, options: { childList: true, subtree: true } },
	]);
	expect(removalCallback).toBeTypeOf('function');

	visibilityCallback?.([{ target: canvas, isIntersecting: true }]);
	await visibleRan.promise;
	await settleMicrotasks();

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:visible']);
	expect(cleanups).toEqual([]);

	canvas.parentElement = null;
	root.childNodes.splice(root.childNodes.indexOf(canvas), 1);
	removalCallback?.([{ removedNodes: [canvas] }]);

	expect(cleanups).toEqual(['visible', 'behavior']);
	expect(resume.getElement('h1')).toBeUndefined();

	await resume.activateBehaviors('h1');

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:visible']);
});

test('resume runtime uses a global IntersectionObserver for visible events when no observer factory is injected', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	const globalScope = globalThis as {
		IntersectionObserver?: new (
			callback: (
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
			) => void,
		) => {
			observe(element: FakeElement): void;
			unobserve(element: FakeElement): void;
			disconnect(): void;
		};
	};
	const previousObserver = globalScope.IntersectionObserver;
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
		  ) => void)
		| undefined;

	globalScope.IntersectionObserver = class {
		constructor(
			callback: (
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting?: boolean;
					readonly intersectionRatio?: number;
				}>,
			) => void,
		) {
			visibilityCallback = callback;
		}

		observe(element: FakeElement): void {
			observed.push(element);
		}

		unobserve(element: FakeElement): void {
			unobserved.push(element);
		}

		disconnect(): void {}
	};

	try {
		const resume = createResumeRuntime({
			root,
			graph: createRuntimeGraph({ cells: [] }),
			view: {
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
				],
				events: [
					{
						hostNodeId: 'h1',
						eventName: 'visible',
						symbolIds: ['symbol:visible'],
					},
				],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
			loadSymbol(symbolId) {
				loadedSymbols.push(symbolId);
				return () => undefined;
			},
		});

		await resume.start();

		expect(observed).toEqual([image]);
		expect(visibilityCallback).toBeDefined();

		visibilityCallback?.([{ target: image, isIntersecting: true }]);
		await settleMicrotasks();

		expect(unobserved).toEqual([image]);
		expect(loadedSymbols).toEqual(['symbol:visible']);
	} finally {
		globalScope.IntersectionObserver = previousObserver;
	}
});

test('resume runtime unobserves visible hosts disposed before first intersection', async () => {
	const image = element('IMG');
	const root = element('SECTION', [image]);
	const observed: FakeElement[] = [];
	const unobserved: FakeElement[] = [];
	const loadedSymbols: string[] = [];
	let visibilityCallback:
		| ((
				entries: ReadonlyArray<{
					readonly target: FakeElement;
					readonly isIntersecting: boolean;
				}>,
		  ) => void)
		| undefined;
	const resume = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'img' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'visible',
					symbolIds: ['symbol:visible'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		createVisibilityObserver(callback) {
			visibilityCallback = callback;
			return {
				observe(target) {
					observed.push(target);
				},
				unobserve(target) {
					unobserved.push(target);
				},
			};
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
	});

	await resume.start();

	expect(observed).toEqual([image]);

	resume.disposeHost('h1');

	expect(unobserved).toEqual([image]);

	visibilityCallback?.([{ target: image, isIntersecting: true }]);
	await settleMicrotasks();

	expect(loadedSymbols).toEqual([]);
});

test('resume runtime dispatches handler arrays in order and flushes committed writes on error', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const writes: RuntimeGraphWrite[] = [];
	const flushedWrites: RuntimeGraphWrite[][] = [];
	const loadedSymbols: string[] = [];
	const ignoredReturns: unknown[] = [];
	const failure = new Error('second handler failed');
	const graph: RuntimeGraph = {
		read() {
			return undefined;
		},
		write(write) {
			writes.push(write);
		},
		update() {
			return undefined;
		},
		call() {
			return undefined;
		},
		delete() {
			return true;
		},
		subscribe() {},
		async flush() {
			flushedWrites.push([...writes]);
		},
		takeJournal() {
			return [];
		},
		takeSharedPatches() {
			return [];
		},
		applySharedPatch() {
			return false;
		},
		listSharedDefinitions() {
			return [];
		},
	};

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:first', 'symbol:second', 'symbol:third'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:first') {
				return ({ graph: runtimeGraph }) => {
					runtimeGraph.write({
						graphNodeId: 'state:count',
						value: 1,
					});
					const ignored = { type: 'setText', locator: 'ignored', value: 'ignored' };
					ignoredReturns.push(ignored);
					return ignored;
				};
			}

			if (symbolId === 'symbol:second') {
				return async () => {
					throw failure;
				};
			}

			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:count',
					value: 3,
				});
			};
		},
	});

	await resume.start();
	flushedWrites.splice(0);

	await expect(root.listeners[0].listener(event('click', button, ''))).rejects.toBe(failure);

	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);
	expect(writes).toEqual([{ graphNodeId: 'state:count', value: 1 }]);
	expect(flushedWrites).toEqual([[{ graphNodeId: 'state:count', value: 1 }]]);
	expect(ignoredReturns).toHaveLength(1);
});

test('resume runtime reports lazy event load failures to the app error hook and flushes committed writes', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const writes: RuntimeGraphWrite[] = [];
	const flushedWrites: RuntimeGraphWrite[][] = [];
	const loadedSymbols: string[] = [];
	const reportedErrors: unknown[] = [];
	const reportedContexts: unknown[] = [];
	const failure = new Error('resolver rejected');
	const graph: RuntimeGraph = {
		read() {
			return undefined;
		},
		write(write) {
			writes.push(write);
		},
		update() {
			return undefined;
		},
		call() {
			return undefined;
		},
		delete() {
			return true;
		},
		subscribe() {},
		async flush() {
			flushedWrites.push([...writes]);
		},
		takeJournal() {
			return [];
		},
		takeSharedPatches() {
			return [];
		},
		applySharedPatch() {
			return false;
		},
		listSharedDefinitions() {
			return [];
		},
	};

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [
				{
					hostNodeId: 'h1',
					eventName: 'click',
					symbolIds: ['symbol:first', 'symbol:second', 'symbol:third'],
				},
			],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);

			if (symbolId === 'symbol:first') {
				return ({ graph: runtimeGraph }) => {
					runtimeGraph.write({
						graphNodeId: 'state:count',
						value: 1,
					});
				};
			}

			if (symbolId === 'symbol:second') {
				return Promise.reject(failure);
			}

			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({
					graphNodeId: 'state:count',
					value: 3,
				});
			};
		},
		onError(error, context) {
			reportedErrors.push(error);
			reportedContexts.push(context);
		},
	});

	await resume.start();
	flushedWrites.splice(0);

	const click = event('click', button, '');
	await expect(root.listeners[0].listener(click)).rejects.toBe(failure);

	expect(reportedErrors).toEqual([failure]);
	expect(reportedContexts).toEqual([
		expect.objectContaining({
			phase: 'event',
			hostNodeId: 'h1',
			eventName: 'click',
			symbolId: 'symbol:second',
			event: click,
			element: button,
		}),
	]);
	expect(loadedSymbols).toEqual(['symbol:first', 'symbol:second']);
	expect(writes).toEqual([{ graphNodeId: 'state:count', value: 1 }]);
	expect(flushedWrites).toEqual([[{ graphNodeId: 'state:count', value: 1 }]]);
});

test('resume runtime materializes async boundary comment anchors', async () => {
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const graph = createRuntimeGraph({
		cells: [],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: {
						strategy: 'dom-order-comment',
						index: 0,
					},
					endAnchor: {
						strategy: 'dom-order-comment',
						index: 1,
					},
					asyncReads: [
						{
							source: 'details.title',
							graphNodeId: 'computed:details',
							path: ['title'],
							runnerSymbolId: 'symbol:details',
						},
					],
				},
			],
		},
		loadSymbol() {
			return () => undefined;
		},
	});

	await resume.start();

	expect(resume.getAsyncBoundary('boundary:0')).toEqual({
		id: 'boundary:0',
		startAnchor: start,
		endAnchor: end,
		asyncReads: [
			{
				source: 'details.title',
				graphNodeId: 'computed:details',
				path: ['title'],
				runnerSymbolId: 'symbol:details',
			},
		],
	});
});

test('resume runtime indexes fragment sibling elements and async boundary comments independently', async () => {
	const header = element('HEADER');
	const button = element('BUTTON');
	const start = comment('markless:async:boundary:0');
	const paragraph = element('P');
	const end = comment('/markless:async:boundary:0');
	// Fragment container: two plain sibling roots followed by one async
	// boundary comment pair. The sibling elements precede the comments in
	// document order, but comment anchors are indexed among comments only
	// (0 and 1), while elements are indexed among elements only.
	const root = element('DIV', [header, button, start, paragraph, end]);
	const graph = createRuntimeGraph({ cells: [] });

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'header' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 3, tagName: 'p' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'details.title',
							graphNodeId: 'computed:details',
							path: ['title'],
							runnerSymbolId: 'symbol:details',
						},
					],
				},
			],
		},
		loadSymbol() {
			return () => undefined;
		},
	});

	await resume.start();

	// Comment anchors are unaffected by the sibling elements before them.
	expect(resume.getAsyncBoundary('boundary:0')?.startAnchor).toBe(start);
	expect(resume.getAsyncBoundary('boundary:0')?.endAnchor).toBe(end);

	// Element locators are unaffected by the comment anchors between them.
	expect(resume.getElement('h0')).toBe(header);
	expect(resume.getElement('h1')).toBe(button);
	expect(resume.getElement('h2')).toBe(paragraph);
});

test('resume runtime emits structural async boundary journal entries without symbol imports', async () => {
	const result = deferred<{ readonly title: string }>();
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const journalBatches: ReadonlyArray<DomJournalEntry>[] = [];
	const loadedSymbols: string[] = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return result.promise;
				},
			},
		],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: {
						strategy: 'dom-order-comment',
						index: 0,
					},
					endAnchor: {
						strategy: 'dom-order-comment',
						index: 1,
					},
					asyncReads: [
						{
							source: 'details',
							graphNodeId: 'computed:details',
							path: ['title'],
							runnerSymbolId: 'symbol:details-runner',
						},
					],
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
		applyDomJournal(entries) {
			journalBatches.push([...entries]);
		},
	});

	await resume.start();

	graph.read('computed:details');
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(journalBatches).toEqual([
		[
			{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
			{
				type: 'insertRange',
				locator: 'async-boundary:boundary:0:start',
				fragment: {
					type: 'async-boundary-snapshot',
					boundaryId: 'boundary:0',
					graphNodeId: 'computed:details',
					path: ['title'],
					snapshot: {
						status: 'pending',
						version: 1,
						key: 'a',
					},
				},
			},
		],
	]);

	result.resolve({ title: 'Alice' });
	await drainMicrotasks();
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(journalBatches).toEqual([
		[
			{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
			{
				type: 'insertRange',
				locator: 'async-boundary:boundary:0:start',
				fragment: {
					type: 'async-boundary-snapshot',
					boundaryId: 'boundary:0',
					graphNodeId: 'computed:details',
					path: ['title'],
					snapshot: {
						status: 'pending',
						version: 1,
						key: 'a',
					},
				},
			},
		],
		[
			{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
			{
				type: 'insertRange',
				locator: 'async-boundary:boundary:0:start',
				fragment: {
					type: 'async-boundary-snapshot',
					boundaryId: 'boundary:0',
					graphNodeId: 'computed:details',
					path: ['title'],
					snapshot: {
						status: 'fulfilled',
						version: 1,
						key: 'a',
						value: { title: 'Alice' },
					},
				},
			},
		],
	]);
});

test('resume runtime does not treat async runner symbols as DOM update symbols', async () => {
	const result = deferred<string>();
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const seenStatuses: string[] = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return result.promise;
				},
			},
		],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: {
						strategy: 'dom-order-comment',
						index: 0,
					},
					endAnchor: {
						strategy: 'dom-order-comment',
						index: 1,
					},
					asyncReads: [
						{
							source: 'details.title',
							graphNodeId: 'computed:details',
							path: [],
							runnerSymbolId: 'symbol:details-runner',
						},
					],
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ asyncBoundary, asyncRead, graph: runtimeGraph }) => {
				const snapshot = runtimeGraph.read(asyncRead!.graphNodeId) as {
					readonly status: string;
				};
				seenStatuses.push(`${asyncBoundary!.id}:${snapshot.status}`);
				return {
					type: 'setText',
					locator: `boundary:${asyncBoundary!.id}`,
					value: snapshot.status,
				};
			};
		},
	});

	await resume.start();

	expect(loadedSymbols).toEqual([]);
	expect(seenStatuses).toEqual([]);

	graph.read('computed:details');
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(seenStatuses).toEqual([]);
	expect(graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 1,
		key: 'a',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
		{
			type: 'insertRange',
			locator: 'async-boundary:boundary:0:start',
			fragment: {
				type: 'async-boundary-snapshot',
				boundaryId: 'boundary:0',
				graphNodeId: 'computed:details',
				path: [],
				snapshot: {
					status: 'pending',
					version: 1,
					key: 'a',
				},
			},
		},
	]);

	result.resolve('Alice');
	await drainMicrotasks();
	await graph.flush();

	expect(loadedSymbols).toEqual([]);
	expect(seenStatuses).toEqual([]);
	expect(graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 1,
		key: 'a',
		value: 'Alice',
	});
	expect(graph.takeJournal()).toEqual([
		{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
		{
			type: 'insertRange',
			locator: 'async-boundary:boundary:0:start',
			fragment: {
				type: 'async-boundary-snapshot',
				boundaryId: 'boundary:0',
				graphNodeId: 'computed:details',
				path: [],
				snapshot: {
					status: 'fulfilled',
					version: 1,
					key: 'a',
					value: 'Alice',
				},
			},
		},
	]);
});

test('resume runtime aligns two sibling async boundaries and replaces only the settled range', async () => {
	const firstResult = deferred<string>();
	const secondResult = deferred<string>();
	const firstStart = comment('markless:async:boundary:0');
	const firstPending = element('P');
	const firstEnd = comment('/markless:async:boundary:0');
	const divider = element('HR');
	const secondStart = comment('markless:async:boundary:1');
	const secondPending = element('P');
	const secondEnd = comment('/markless:async:boundary:1');
	const root = rangeElement('SECTION', [
		firstStart,
		firstPending,
		firstEnd,
		divider,
		secondStart,
		secondPending,
		secondEnd,
	]);
	const renderedSnapshots: string[] = [];
	let renderedNode: FakeComment | undefined;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'a' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:first',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return firstResult.promise;
				},
			},
			{
				graphNodeId: 'computed:second',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run() {
					return secondResult.promise;
				},
			},
		],
	});

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'hr' },
				{ hostNodeId: 'h3', strategy: 'dom-order', index: 3, tagName: 'p' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'first',
							graphNodeId: 'computed:first',
							path: [],
							runnerSymbolId: 'symbol:first-runner',
						},
					],
				},
				{
					id: 'boundary:1',
					startAnchor: { strategy: 'dom-order-comment', index: 2 },
					endAnchor: { strategy: 'dom-order-comment', index: 3 },
					asyncReads: [
						{
							source: 'second',
							graphNodeId: 'computed:second',
							path: [],
							runnerSymbolId: 'symbol:second-runner',
						},
					],
				},
			],
		},
		loadSymbol() {
			return () => undefined;
		},
		applyDomJournal(entries) {
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					const match = /^async-boundary:(.+):(start|end)$/.exec(locator);
					if (!match) return undefined;
					const boundary = resume.getAsyncBoundary(match[1]);
					return match[2] === 'start' ? boundary?.startAnchor : boundary?.endAnchor;
				},
				renderAsyncSnapshot(fragment) {
					const snapshot = fragment.snapshot as { readonly status: string };
					renderedSnapshots.push(`${fragment.boundaryId}:${snapshot.status}`);
					renderedNode = comment(`rendered:${fragment.boundaryId}:${snapshot.status}`);
					return [renderedNode];
				},
			});
		},
	});

	await resume.start();

	// Flat document-order comment indexes: boundary i owns comments i*2 and i*2+1.
	expect(resume.getAsyncBoundary('boundary:0')?.startAnchor).toBe(firstStart);
	expect(resume.getAsyncBoundary('boundary:0')?.endAnchor).toBe(firstEnd);
	expect(resume.getAsyncBoundary('boundary:1')?.startAnchor).toBe(secondStart);
	expect(resume.getAsyncBoundary('boundary:1')?.endAnchor).toBe(secondEnd);

	graph.read('computed:second');
	await graph.flush();
	secondResult.resolve('Second');
	await drainMicrotasks();
	await graph.flush();

	expect(renderedSnapshots).toEqual(['boundary:1:pending', 'boundary:1:fulfilled']);
	expect(root.childNodes).toHaveLength(7);
	expect(root.childNodes[0]).toBe(firstStart);
	expect(root.childNodes[1]).toBe(firstPending);
	expect(root.childNodes[2]).toBe(firstEnd);
	expect(root.childNodes[3]).toBe(divider);
	expect(root.childNodes[4]).toBe(secondStart);
	expect(root.childNodes[5]).toBe(renderedNode);
	expect(root.childNodes[6]).toBe(secondEnd);
	expect(root.childNodes.includes(secondPending)).toBe(false);
	expect(firstPending.parentElement).toBe(root);
});

type FakeRangeParentElement = FakeElement & {
	insertBefore(node: FakeNode, before: FakeNode | null): FakeNode;
	removeChild(node: FakeNode): FakeNode;
};

function rangeElement(tagName: string, childNodes: FakeNode[]): FakeRangeParentElement {
	const parent = element(tagName, childNodes) as FakeRangeParentElement;
	parent.insertBefore = (node, before) => {
		const currentIndex = parent.childNodes.indexOf(node);
		if (currentIndex >= 0) parent.childNodes.splice(currentIndex, 1);

		const beforeIndex = before === null ? -1 : parent.childNodes.indexOf(before);
		const insertIndex = beforeIndex >= 0 ? beforeIndex : parent.childNodes.length;
		parent.childNodes.splice(insertIndex, 0, node);
		setParentNode(node, parent);
		return node;
	};
	parent.removeChild = (node) => {
		const index = parent.childNodes.indexOf(node);
		if (index >= 0) parent.childNodes.splice(index, 1);
		setParentNode(node, null);
		return node;
	};
	for (const child of parent.childNodes) setParentNode(child, parent);
	return parent;
}

function setParentNode(node: FakeNode, parent: FakeRangeParentElement | null): void {
	(node as { parentNode?: FakeRangeParentElement | null }).parentNode = parent;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

async function drainMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}

test('resume runtime replaces branch ranges lazily when the test arm flips', async () => {
	const start = comment('markless:branch:branch-site:0');
	const shown = element('P');
	const end = comment('/markless:branch:branch-site:0');
	const sibling = element('SPAN');
	const root = rangeElement('SECTION', [start, shown, end, sibling]);
	const hidden = element('P');
	const loadedSymbols: string[] = [];
	const renderedHtml: string[] = [];
	const subscriptions: Array<{
		readonly graphNodeId: string;
		readonly path?: ReadonlyArray<string>;
		readonly run: (value: unknown) => unknown;
	}> = [];
	let open = true;
	const graph = {
		read: (graphNodeId: string) => (graphNodeId === 'state:open' ? open : undefined),
		subscribe: (subscription: (typeof subscriptions)[number]) =>
			void subscriptions.push(subscription),
		subscribeJournal: () => () => undefined,
		flush: async () => undefined,
	} as unknown as RuntimeGraph;

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [],
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
					symbolId: 'symbol:flip',
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				},
				// Static branch record without symbolId/testReads is skipped
				// entirely, so its out-of-range anchors must never resolve.
				{
					id: 'branch-site:static',
					startAnchor: { strategy: 'dom-order-comment', index: 8 },
					endAnchor: { strategy: 'dom-order-comment', index: 9 },
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => ({ arm: open ? 0 : 1, html: open ? '<p>Shown</p>' : '<p>Hidden</p>' });
		},
		renderBranchHtml(html) {
			renderedHtml.push(html);
			return [hidden];
		},
	});

	await resume.start();
	// Seeding the current arm reads the graph without loading any symbol.
	expect(loadedSymbols).toEqual([]);
	expect(subscriptions).toEqual([
		expect.objectContaining({ graphNodeId: 'state:open', path: [] }),
	]);

	open = false;
	const entries = (await subscriptions[0]!.run(false)) as DomJournalEntry[];
	expect(loadedSymbols).toEqual(['symbol:flip']);
	expect(renderedHtml).toEqual(['<p>Hidden</p>']);
	expect(entries).toEqual([
		{ type: 'removeRange', locator: 'branch:branch-site:0' },
		{ type: 'insertRange', locator: 'branch:branch-site:0:start', fragment: [hidden] },
	]);

	applyDomJournalEntries(entries, {
		resolveTarget(locator) {
			if (locator === 'branch:branch-site:0:start') return start;
			if (locator === 'branch:branch-site:0:end') return end;
			return undefined;
		},
	});

	expect(root.childNodes).toHaveLength(4);
	expect(root.childNodes[0]).toBe(start);
	expect(root.childNodes[1]).toBe(hidden);
	expect(root.childNodes[2]).toBe(end);
	expect(root.childNodes[3]).toBe(sibling);
	expect(root.childNodes.includes(shown)).toBe(false);

	// Same test value again: arm unchanged, so no symbol load and no journal ops.
	const second = await subscriptions[0]!.run(false);
	expect(second).toBeUndefined();
	expect(loadedSymbols).toEqual(['symbol:flip']);
	expect(renderedHtml).toEqual(['<p>Hidden</p>']);
});

// Shared keyed repeat fixture: TBODY parent with two TR rows whose hostPath
// [1] event hosts are the row buttons, plus a trailing FOOTER whose dom-order
// locator index (8) already counts the SSR-rendered row elements.
function keyedRepeatFixture(options: {
	readonly rowEvents: ResumeKeyedRepeatRowEvent[];
	readonly events?: ResumeEventRecord[];
}) {
	const firstRowButton = element('BUTTON');
	const secondRowButton = element('BUTTON');
	const tbody = element('TBODY', [
		element('TR', [element('TD'), firstRowButton]),
		element('TR', [element('TD'), secondRowButton]),
	]);
	const footer = element('FOOTER');
	const root = element('SECTION', [tbody, footer]);
	const view: ResumeViewRecord = {
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'tbody' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 8, tagName: 'footer' },
		],
		events: options.events ?? [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'entry',
				rowElementCount: 3,
				rowEvents: options.rowEvents,
			},
		],
	};
	const loadedSymbols: string[] = [];
	const loadSymbol = (symbolId: string) => {
		loadedSymbols.push(symbolId);
		return () => undefined;
	};
	return { root, firstRowButton, secondRowButton, footer, view, loadedSymbols, loadSymbol };
}

test('resume runtime rejects duplicate keyed repeat values before row materialization', async () => {
	const { root, view, loadSymbol } = keyedRepeatFixture({
		rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }],
	});
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'state:rows',
				value: [
					{ id: 'fruit', label: 'apple' },
					{ id: 'fruit', label: 'pear' },
				],
			},
		],
	});

	await expect(async () => {
		const resume = createResumeRuntime({ root, graph, view, loadSymbol });
		await resume.start();
	}).rejects.toThrowError(
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
			message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from entry.id.',
			phase: 'runtime',
			docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
			repeatId: 'repeat:0',
			keyPath: ['id'],
			collidingValue: 'fruit',
		}),
	);
});

test('resume runtime materializes keyed repeat row event hosts from the live collection', async () => {
	const { root, firstRowButton, secondRowButton, footer, view, loadedSymbols, loadSymbol } =
		keyedRepeatFixture({
			rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }],
		});
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:rows', value: [{ id: 1 }, { id: 2 }] }],
	});

	const resume = createResumeRuntime({ root, graph, view, loadSymbol });

	await resume.start();

	// Row events register the delegated capture listener even though no
	// ordinary view event uses "click".
	expect(root.listeners.map((listener) => listener.type)).toContain('click');

	// Both rows' hostPath [1] hosts carry row event records.
	await resume.dispatch(event('click', firstRowButton, ''));
	await resume.dispatch(event('click', secondRowButton, ''));
	expect(loadedSymbols).toEqual(['symbol:row', 'symbol:row']);

	// Elements outside the repeat never match row records.
	await resume.dispatch(event('click', footer, ''));
	expect(loadedSymbols).toHaveLength(2);

	// A trailing dom-order locator after the repeat rows still resolves.
	expect(resume.getElement('h1')).toBe(footer);
});

test('resume runtime materializes zero keyed repeat rows without throwing', async () => {
	const { root, firstRowButton, view, loadedSymbols, loadSymbol } = keyedRepeatFixture({
		rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:row'] }],
	});
	// Empty collection: SSR took @empty, so the parent's element children are
	// not rows and no row record may attach to any of them.
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:rows', value: [] }] });

	const resume = createResumeRuntime({ root, graph, view, loadSymbol });

	await resume.start();
	await resume.dispatch(event('click', firstRowButton, ''));
	expect(loadedSymbols).toEqual([]);
});

test('resume runtime dispatches keyed repeat row events with fresh row locals', async () => {
	const { root, firstRowButton, secondRowButton, footer, view } = keyedRepeatFixture({
		rowEvents: [
			{
				hostPath: [1],
				eventName: 'click',
				symbolIds: ['symbol:row'],
				syncPolicy: {
					when: { type: 'event-equals', field: 'key', value: 'Enter' },
					actions: ['preventDefault'],
				},
			},
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:footer'] }],
	});
	const firstItem = { id: 1, label: 'one' };
	const secondItem = { id: 2, label: 'two' };
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:rows', value: [firstItem, secondItem] },
			{ graphNodeId: 'state:selected', value: 0 },
		],
	});
	graph.subscribe({
		id: 'dom-update:selected',
		graphNodeId: 'state:selected',
		path: [],
		run(value) {
			return { type: 'setText', locator: 'selected', value };
		},
	});
	const loadedSymbols: string[] = [];
	const receivedLocals: Array<Record<string, unknown> | undefined> = [];

	const resume = createResumeRuntime({
		root,
		graph,
		view,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:footer') return () => undefined;
			return ({ graph: runtimeGraph, locals }) => {
				receivedLocals.push(locals as Record<string, unknown> | undefined);
				const entry = (locals as { readonly entry: { readonly id: number } }).entry;
				runtimeGraph.write({ graphNodeId: 'state:selected', path: [], value: entry.id });
			};
		},
	});

	await resume.start();

	const firstClick = event('click', firstRowButton, 'Enter');
	await resume.dispatch(firstClick);
	expect(loadedSymbols).toEqual(['symbol:row']);
	expect(receivedLocals[0]?.entry).toBe(firstItem);
	// The row sync policy runs through the shared helper before the symbol.
	expect(firstClick.defaultPrevented).toBe(true);
	// Handler graph writes flush like ordinary event dispatch.
	expect(graph.read('state:selected')).toBe(1);
	expect(graph.takeJournal()).toEqual([{ type: 'setText', locator: 'selected', value: 1 }]);

	await resume.dispatch(event('click', secondRowButton, 'x'));
	expect(receivedLocals[1]?.entry).toBe(secondItem);
	expect(graph.read('state:selected')).toBe(2);

	// Row keys, not positions, own row identity: the same DOM row keeps its
	// original logical item after the collection reorders.
	graph.write({ graphNodeId: 'state:rows', path: [], value: [secondItem, firstItem] });
	await graph.flush();
	await resume.dispatch(event('click', firstRowButton, 'x'));
	expect(receivedLocals[2]?.entry).toBe(firstItem);

	// A same-named event on a non-row host resolves through ordinary records.
	await resume.dispatch(event('click', footer, 'x'));
	expect(loadedSymbols).toEqual(['symbol:row', 'symbol:row', 'symbol:row', 'symbol:footer']);
});

test('resume runtime wakes keyed repeats on collection writes', async () => {
	const firstRow = element('TR');
	const secondRow = element('TR');
	const thirdRow = element('TR');
	const tbody = rangeElement('TBODY', [firstRow, secondRow, thirdRow]) as FakeRangeParentElement & {
		appendChild(node: FakeNode): FakeNode;
	};
	tbody.appendChild = (node) => tbody.insertBefore(node, null);
	const root = element('SECTION', [tbody]);
	const firstItem = { id: 'alpha' };
	const secondItem = { id: 'beta' };
	const thirdItem = { id: 'gamma' };
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:rows', value: [firstItem, secondItem, thirdItem] }],
	});
	const view: ResumeViewRecord = {
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'tbody' }],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		keyedRepeats: [
			{
				id: 'repeat:0',
				parentHostNodeId: 'h0',
				collectionGraphNodeId: 'state:rows',
				collectionPath: [],
				keyPath: ['id'],
				itemName: 'entry',
				rowElementCount: 1,
				rowEvents: [],
			},
		],
	};

	await createResumeRuntime({ root, graph, view, loadSymbol: () => () => undefined }).start();
	graph.write({ graphNodeId: 'state:rows', value: [thirdItem, secondItem, firstItem] });
	await graph.flush();

	expect(tbody.childNodes).toEqual([thirdRow, secondRow, firstRow]);
});

test('resume runtime dispose removes listeners, subscriptions, and host cleanups', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:count', value: 0 }],
	});
	const cleanups: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'button' }],
			events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
			domUpdates: [
				{
					hostNodeId: 'h0',
					source: 'count',
					graphNodeId: 'state:count',
					path: [],
					target: { kind: 'text' },
					symbolId: 'symbol:text',
				},
			],
			behaviors: [{ hostNodeId: 'h0', symbolId: 'symbol:behavior', inputSources: [] }],
			elementHandles: [],
			asyncBoundaries: [],
		} as never,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:behavior') return () => () => cleanups.push('behavior');
			return () => undefined;
		},
	});
	await resume.start();
	await resume.activateBehaviors('h0');

	expect(root.listeners.map((listener) => listener.type)).toEqual(['click']);
	resume.dispose();
	graph.write({ graphNodeId: 'state:count', value: 1 });
	await graph.flush();

	expect(root.listeners).toEqual([]);
	expect(cleanups).toEqual(['behavior']);
	expect(graph.takeJournal()).toEqual([]);
});

test('resume runtime dispose releases container-owned graph subscriptions', async () => {
	const root = element('SECTION', [
		comment('markless:branch:branch-site:0'),
		comment('/markless:branch:branch-site:0'),
		comment('markless:async:boundary:0'),
		comment('/markless:async:boundary:0'),
	]);
	const released: string[] = [];
	const graph = {
		read: (graphNodeId: string) => (graphNodeId === 'state:open' ? true : undefined),
		subscribe(subscription: { readonly id: string }) {
			return () => released.push(subscription.id);
		},
		subscribeJournal() {
			return () => released.push('journal');
		},
		listSharedDefinitions: () => [],
		flush: async () => undefined,
	} as unknown as RuntimeGraph;

	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [
				{
					id: 'boundary:0',
					startAnchor: { strategy: 'dom-order-comment', index: 2 },
					endAnchor: { strategy: 'dom-order-comment', index: 3 },
					asyncReads: [
						{
							source: 'details',
							graphNodeId: 'async:details',
							path: [],
							runnerSymbolId: 'symbol:details',
						},
					],
				},
			],
			branches: [
				{
					id: 'branch-site:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:branch',
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				},
			],
		} as never,
		loadSymbol: () => () => undefined,
		applyDomJournal: async () => undefined,
	});

	await resume.start();
	resume.dispose();

	expect(released).toEqual([
		'journal',
		'async-boundary:boundary:0:async:details:',
		'branch-demand:branch-site:0:state:open:',
	]);
});

test('resume runtime keeps settled async boundary snapshots idle at startup', async () => {
	const start = comment('markless:async:boundary:0');
	const settled = element('P');
	const end = comment('/markless:async:boundary:0');
	const root = element('SECTION', [start, settled, end]);
	const loadedSymbols: string[] = [];
	const applied: DomJournalEntry[] = [];
	let runnerRuns = 0;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'ada' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				initialSnapshot: {
					status: 'fulfilled',
					version: 1,
					key: 'ada',
					value: { title: 'User ada' },
				},
				key: (read) => read('state:userId'),
				run() {
					runnerRuns++;
					return { title: 'User ada' };
				},
			},
		],
	});
	const resume = createResumeRuntime({
		root,
		graph,
		view: updatableBoundaryView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return () => undefined;
		},
		applyDomJournal(entries) {
			applied.push(...entries);
		},
	});

	await resume.start();
	await drainMicrotasks();
	await graph.flush();

	// The graph consumed the settled SSR snapshot: zero runners, zero symbol
	// loads, and no range replacement at startup.
	expect(runnerRuns).toBe(0);
	expect(loadedSymbols).toEqual([]);
	expect(applied).toEqual([]);
});

test('resume runtime starts unsettled async boundary runners at creation and settles the range', async () => {
	const start = comment('markless:async:boundary:0');
	const pending = element('P');
	const end = comment('/markless:async:boundary:0');
	const root = element('SECTION', [start, pending, end]);
	const loadedSymbols: string[] = [];
	const applied: DomJournalEntry[] = [];
	const renderedHtml: string[] = [];
	const runs: Array<{ readonly key: unknown; readonly signal: AbortSignal }> = [];
	let result = deferred<{ title: string }>();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:userId', value: 'ada' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run({ key, signal }) {
					runs.push({ key, signal });
					return result.promise;
				},
			},
		],
	});
	const fragmentNode = element('P');
	const resume = createResumeRuntime({
		root,
		graph,
		view: updatableBoundaryView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph, status }) => ({
				arm: status === 'rejected' ? 1 : 0,
				html: `<p>${String(runtimeGraph.read('computed:details', ['value', 'title']))}</p>`,
			});
		},
		renderBranchHtml(html) {
			renderedHtml.push(html);
			return [fragmentNode];
		},
		applyDomJournal(entries) {
			applied.push(...entries);
		},
	});

	await resume.start();
	// CSR mounts render @pending between the anchors, so an unsettled boundary
	// is a local demand: the runner starts during runtime startup.
	expect(runs).toHaveLength(1);
	expect(runs[0]).toMatchObject({ key: 'ada' });
	expect(loadedSymbols).toEqual([]);

	result.resolve({ title: 'User ada' });
	await drainMicrotasks();
	await graph.flush();

	expect(loadedSymbols).toEqual(['symbol:boundary-update']);
	expect(renderedHtml).toEqual(['<p>User ada</p>']);
	expect(applied).toEqual([
		{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
		{
			type: 'insertRange',
			locator: 'async-boundary:boundary:0:start',
			fragment: [fragmentNode],
		},
	]);

	// Revalidation: a dependency write aborts the previous run, re-runs the
	// runner, and replaces the boundary range again after the new settle.
	applied.length = 0;
	result = deferred<{ title: string }>();
	graph.write({ graphNodeId: 'state:userId', value: 'grace' });
	await graph.flush();

	expect(runs).toHaveLength(2);
	expect(runs[0]!.signal.aborted).toBe(true);
	expect(runs[1]).toMatchObject({ key: 'grace' });

	result.resolve({ title: 'User grace' });
	await drainMicrotasks();
	await graph.flush();

	expect(renderedHtml).toEqual(['<p>User ada</p>', '<p>User grace</p>']);
	expect(applied).toEqual([
		{ type: 'removeRange', locator: 'async-boundary:boundary:0' },
		{
			type: 'insertRange',
			locator: 'async-boundary:boundary:0:start',
			fragment: [fragmentNode],
		},
	]);
});

// One async boundary whose settled arms rebuild through an update symbol.
function updatableBoundaryView(): ResumeViewRecord {
	return {
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' }],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [
			{
				id: 'boundary:0',
				updateSymbolId: 'symbol:boundary-update',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [
					{
						source: 'details',
						graphNodeId: 'computed:details',
						path: [],
						runnerSymbolId: 'symbol:details-runner',
					},
				],
			},
		],
	};
}

test('resume runtime disposes branch-range hosts before applying removeRange', async () => {
	const start = comment('markless:branch:branch-site:0');
	const arm = element('BUTTON');
	const end = comment('/markless:branch:branch-site:0');
	const root = rangeElement('SECTION', [start, arm, end]);
	const replacement = element('P');
	const loadedSymbols: string[] = [];
	const applied: DomJournalEntry[] = [];
	const cleanupParents: unknown[] = [];
	const handleReads: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:open', value: true },
			{ graphNodeId: 'state:label', value: 'a' },
		],
	});
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:read-handle'] }],
			domUpdates: [
				{
					hostNodeId: 'h1',
					source: 'label',
					graphNodeId: 'state:label',
					path: [],
					symbolId: 'symbol:dom-update',
				},
			],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'chart()',
					functionSource: 'chart',
					inputSources: [],
					inputValues: [],
					symbolId: 'symbol:chart',
				},
			],
			elementHandles: [{ hostNodeId: 'h1', handleId: 'handle:arm', name: 'armButton' }],
			asyncBoundaries: [],
			branches: [
				{
					id: 'branch-site:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:flip',
					testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:chart') {
				return () => () =>
					cleanupParents.push((arm as { readonly parentNode?: unknown }).parentNode);
			}
			if (symbolId === 'symbol:flip') {
				return ({ graph: runtimeGraph }) => ({
					arm: runtimeGraph.read('state:open') ? 0 : 1,
					html: '<p>Flipped</p>',
				});
			}
			if (symbolId === 'symbol:read-handle') {
				return (context) => void handleReads.push(context.getElementHandle('handle:arm'));
			}
			return () => undefined;
		},
		renderBranchHtml: () => [replacement],
		applyDomJournal(entries) {
			applied.push(...entries);
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					if (locator === 'branch:branch-site:0:start') return start;
					if (locator === 'branch:branch-site:0:end') return end;
					return undefined;
				},
			});
		},
	});

	await resume.start();
	await resume.activateBehaviors('h1');
	graph.write({ graphNodeId: 'state:label', value: 'b' });
	await graph.flush();
	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:dom-update']);

	// Flip the branch arm: the outgoing range removes through the DOM journal.
	graph.write({ graphNodeId: 'state:open', value: false });
	await graph.flush();
	await drainMicrotasks();
	await graph.flush();

	// The behavior cleanup ran before the host detached from its parent.
	expect(cleanupParents).toEqual([root]);
	expect(root.childNodes.includes(arm)).toBe(false);
	expect(root.childNodes[1]).toBe(replacement);

	// The removed host's dom-update subscription released with the range.
	graph.write({ graphNodeId: 'state:label', value: 'c' });
	await graph.flush();
	expect(loadedSymbols.filter((id) => id === 'symbol:dom-update')).toHaveLength(1);

	// The removed host's element handle reads undefined.
	await root.listeners
		.find((entry) => entry.type === 'click')!
		.listener(event('click', root, ''));
	expect(handleReads).toEqual([undefined]);

	// The branch's own test-read subscription survives: flipping back works.
	graph.write({ graphNodeId: 'state:open', value: true });
	await graph.flush();
	await drainMicrotasks();
	await graph.flush();
	expect(loadedSymbols.filter((id) => id === 'symbol:flip')).toHaveLength(2);
	expect(applied.filter((entry) => entry.type === 'removeRange')).toHaveLength(2);
});

// Branch armRecords view (L4 S3b): arm 0 renders <section><button/></section>
// between the anchors (button event hostPath [0, 0], section text update
// hostPath [0]); arm 1 renders a bare <button/> (event hostPath [0]).
function armRecordsView(arm0Extras?: {
	readonly behaviors?: ReadonlyArray<Record<string, unknown>>;
	readonly elementHandles?: ReadonlyArray<Record<string, unknown>>;
}): ResumeViewRecord {
	return {
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:read-handle'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		branches: [
			{
				id: 'branch-site:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:flip',
				testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
				armRecords: [
					{
						events: [
							{
								hostPath: [0, 0],
								eventName: 'click',
								symbolIds: ['symbol:arm-click'],
							},
						],
						domUpdates: [
							{
								hostNodeId: 'h-arm',
								source: 'label',
								graphNodeId: 'state:label',
								path: [],
								hostPath: [0],
								symbolId: 'symbol:arm-text',
							},
						],
						behaviors: arm0Extras?.behaviors ?? [],
						elementHandles: arm0Extras?.elementHandles ?? [],
					},
					{
						events: [
							{
								hostPath: [0],
								eventName: 'click',
								symbolIds: ['symbol:closed-click'],
							},
						],
						domUpdates: [],
						behaviors: [],
						elementHandles: [],
					},
				],
			},
		],
	};
}

test('resume runtime leaves branch arm records inert until the branch is demanded', async () => {
	const start = comment('markless:branch:branch-site:0');
	const armButton = element('BUTTON');
	const armSection = element('SECTION', [armButton]);
	const end = comment('/markless:branch:branch-site:0');
	const root = rangeElement('MAIN', [start, armSection, end]);
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:open', value: true },
			{ graphNodeId: 'state:label', value: 'a' },
		],
	});
	const loadedSymbols: string[] = [];
	const updateElements: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: armRecordsView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:arm-text') {
				return ({ element: host }) => void updateElements.push(host);
			}
			return () => undefined;
		},
	});
	await resume.start();

	// Branch arm event names do not install delegated listeners or load eagerly.
	expect(root.listeners.map((listener) => listener.type)).toContain('click');
	expect(loadedSymbols).toEqual([]);

	await resume.dispatch(event('click', armButton, ''));
	expect(loadedSymbols).toEqual(['symbol:read-handle']);

	graph.write({ graphNodeId: 'state:label', value: 'b' });
	await graph.flush();
	expect(loadedSymbols).toEqual(['symbol:read-handle']);
	expect(updateElements).toEqual([]);
});

test('resume runtime rewires arm records across branch flips', async () => {
	const start = comment('markless:branch:branch-site:0');
	const armButton = element('BUTTON');
	const armSection = element('SECTION', [armButton]);
	const end = comment('/markless:branch:branch-site:0');
	const root = rangeElement('MAIN', [start, armSection, end]);
	const closedButton = element('BUTTON');
	const reopenedButton = element('BUTTON');
	const reopenedSection = element('SECTION', [reopenedButton]);
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:open', value: true },
			{ graphNodeId: 'state:label', value: 'a' },
		],
	});
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: armRecordsView(),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:flip') {
				return ({ graph: runtimeGraph }) => ({
					arm: runtimeGraph.read('state:open') ? 0 : 1,
					html: '<button></button>',
				});
			}
			return () => undefined;
		},
		renderBranchHtml: () => (graph.read('state:open') ? [reopenedSection] : [closedButton]),
		applyDomJournal(entries) {
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					if (locator === 'branch:branch-site:0:start') return start;
					if (locator === 'branch:branch-site:0:end') return end;
					return undefined;
				},
			});
		},
	});
	await resume.start();

	// Flip to arm 1.
	graph.write({ graphNodeId: 'state:open', value: false });
	await graph.flush();
	await drainMicrotasks();
	await graph.flush();
	expect(root.childNodes[1]).toBe(closedButton);

	// The new arm's button dispatches its own symbol.
	await resume.dispatch(event('click', closedButton, ''));
	expect(loadedSymbols).toContain('symbol:closed-click');

	// The outgoing arm's dom-update subscription released with the range and
	// its event record no longer dispatches.
	graph.write({ graphNodeId: 'state:label', value: 'b' });
	await graph.flush();
	expect(loadedSymbols.filter((id) => id === 'symbol:arm-text')).toHaveLength(0);
	await resume.dispatch(event('click', armButton, ''));
	expect(loadedSymbols.filter((id) => id === 'symbol:arm-click')).toHaveLength(0);

	// Flip back to arm 0: its records are live again against the fresh DOM.
	graph.write({ graphNodeId: 'state:open', value: true });
	await graph.flush();
	await drainMicrotasks();
	await graph.flush();
	await resume.dispatch(event('click', reopenedButton, ''));
	expect(loadedSymbols.filter((id) => id === 'symbol:arm-click')).toHaveLength(1);
	graph.write({ graphNodeId: 'state:label', value: 'c' });
	await graph.flush();
	expect(loadedSymbols.filter((id) => id === 'symbol:arm-text')).toHaveLength(1);
});

test('resume runtime activates arm behaviors and handles on materialize and disposes them on flip-out', async () => {
	const start = comment('markless:branch:branch-site:0');
	const armSection = element('SECTION');
	const end = comment('/markless:branch:branch-site:0');
	const root = rangeElement('MAIN', [start, armSection, end]);
	const replacement = element('BUTTON');
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:open', value: true }] });
	const loadedSymbols: string[] = [];
	const cleanupParents: unknown[] = [];
	const handleReads: unknown[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: armRecordsView({
			behaviors: [
				{
					hostPath: [0],
					hostNodeId: 'h-arm',
					source: 'chart()',
					functionSource: 'chart',
					inputSources: [],
					inputValues: [],
					symbolId: 'symbol:arm-behavior',
				},
			],
			elementHandles: [
				{ hostPath: [0], hostNodeId: 'h-arm', handleId: 'handle:arm', name: 'armEl' },
			],
		}),
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:arm-behavior') {
				return () => () =>
					cleanupParents.push(
						(armSection as { readonly parentNode?: unknown }).parentNode,
					);
			}
			if (symbolId === 'symbol:read-handle') {
				return (context) => void handleReads.push(context.getElementHandle('handle:arm'));
			}
			if (symbolId === 'symbol:flip') {
				return ({ graph: runtimeGraph }) => ({
					arm: runtimeGraph.read('state:open') ? 0 : 1,
					html: '<button></button>',
				});
			}
			return () => undefined;
		},
		renderBranchHtml: () => [replacement],
		applyDomJournal(entries) {
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					if (locator === 'branch:branch-site:0:start') return start;
					if (locator === 'branch:branch-site:0:end') return end;
					return undefined;
				},
			});
		},
	});

	// Branch arm behaviors and handles are not materialized at startup.
	expect(loadedSymbols).toEqual([]);
	await resume.start();
	expect(loadedSymbols).toEqual([]);

	await resume.dispatch(event('click', root, ''));
	expect(handleReads).toEqual([undefined]);

	// Flip out: the behavior cleanup runs before the host detaches (S2 range
	// disposal catches the synthetic-keyed hosts) and the handle reads undefined.
	graph.write({ graphNodeId: 'state:open', value: false });
	await graph.flush();
	await drainMicrotasks();
	await graph.flush();
	expect(cleanupParents).toEqual([]);
	expect(root.childNodes.includes(armSection)).toBe(false);
	await resume.dispatch(event('click', root, ''));
	expect(handleReads).toEqual([undefined, undefined]);
});

test('resume runtime disposes pending-range hosts when an async boundary settles', async () => {
	const start = comment('markless:async:boundary:0');
	const pending = element('P');
	const end = comment('/markless:async:boundary:0');
	const root = rangeElement('SECTION', [start, pending, end]);
	const fragmentNode = element('P');
	const loadedSymbols: string[] = [];
	const applied: DomJournalEntry[] = [];
	const cleanupParents: unknown[] = [];
	let result = deferred<{ title: string }>();
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:userId', value: 'ada' },
			{ graphNodeId: 'state:tick', value: 0 },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:details',
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				key: (read) => read('state:userId'),
				run: () => result.promise,
			},
		],
	});
	const resume = createResumeRuntime({
		root,
		graph,
		view: {
			...updatableBoundaryView(),
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'p' },
			],
			domUpdates: [
				{
					hostNodeId: 'h1',
					source: 'tick',
					graphNodeId: 'state:tick',
					path: [],
					symbolId: 'symbol:pending-update',
				},
			],
			behaviors: [
				{
					hostNodeId: 'h1',
					source: 'spinner()',
					functionSource: 'spinner',
					inputSources: [],
					inputValues: [],
					symbolId: 'symbol:spinner',
				},
			],
		},
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:spinner') {
				return () => () =>
					cleanupParents.push((pending as { readonly parentNode?: unknown }).parentNode);
			}
			if (symbolId === 'symbol:boundary-update') {
				return ({ status }) => ({
					arm: status === 'rejected' ? 1 : 0,
					html: '<p>Done</p>',
				});
			}
			return () => undefined;
		},
		renderBranchHtml: () => [fragmentNode],
		applyDomJournal(entries) {
			applied.push(...entries);
			applyDomJournalEntries(entries, {
				resolveTarget(locator) {
					if (locator === 'async-boundary:boundary:0:start') return start;
					if (locator === 'async-boundary:boundary:0:end') return end;
					return undefined;
				},
			});
		},
	});

	await resume.start();
	await resume.activateBehaviors('h1');
	graph.write({ graphNodeId: 'state:tick', value: 1 });
	await graph.flush();
	expect(loadedSymbols).toEqual(['symbol:spinner', 'symbol:pending-update']);

	result.resolve({ title: 'User ada' });
	await drainMicrotasks();
	await graph.flush();

	// The @pending host cleaned up before the range detached, and its
	// dom-update subscription released with it.
	expect(cleanupParents).toEqual([root]);
	expect(root.childNodes.includes(pending)).toBe(false);
	graph.write({ graphNodeId: 'state:tick', value: 2 });
	await graph.flush();
	expect(loadedSymbols.filter((id) => id === 'symbol:pending-update')).toHaveLength(1);

	// The boundary's own subscription survives: revalidation settles again.
	applied.length = 0;
	result = deferred<{ title: string }>();
	graph.write({ graphNodeId: 'state:userId', value: 'grace' });
	await graph.flush();
	result.resolve({ title: 'User grace' });
	await drainMicrotasks();
	await graph.flush();
	expect(applied.filter((entry) => entry.type === 'removeRange')).toHaveLength(1);
});

test('resume runtime activates ancestor behavior hosts on descendant dispatch', async () => {
	const button = {
		nodeType: 1 as const,
		tagName: 'BUTTON',
		childNodes: [],
		addEventListener() {},
	};
	const shell = {
		nodeType: 1 as const,
		tagName: 'DIV',
		childNodes: [button] as unknown[],
		addEventListener() {},
	};
	const root = {
		nodeType: 1 as const,
		tagName: 'MAIN',
		childNodes: [shell] as unknown[],
		addEventListener() {},
	};
	(button as { parentElement?: unknown }).parentElement = shell;
	(shell as { parentElement?: unknown }).parentElement = root;
	const loaded: string[] = [];
	const graph = {
		read: () => undefined,
		subscribe: () => () => undefined,
		subscribeJournal: () => () => undefined,
		listSharedDefinitions: () => [],
		flush: async () => undefined,
	};
	const runtime = createResumeRuntime({
		root: root as never,
		graph: graph as never,
		view: {
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'div' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h2', eventName: 'click', symbolIds: ['symbol:click'] }],
			domUpdates: [],
			// The ancestor DIV owns an attach behavior (the event-only runtime
			// activated ancestor hosts on dispatch; the full runtime must too —
			// the music-player App-root controller silently stopped activating
			// when escalation moved the page off the event-only path).
			behaviors: [{ hostNodeId: 'h1', symbolId: 'symbol:controller', inputSources: [] }],
			elementHandles: [],
			asyncBoundaries: [],
		} as never,
		loadSymbol(symbolId: string) {
			loaded.push(symbolId);
			return () => undefined;
		},
		applyDomJournal: () => undefined,
	});
	await runtime.start();
	expect(loaded).toEqual([]);

	await runtime.dispatch({ type: 'click', target: button } as never);
	expect(loaded).toContain('symbol:controller');
	expect(loaded).toContain('symbol:click');
});
