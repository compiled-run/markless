import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { createDomUpdateEntry } from '../src/dom-update.ts';
import {
	createResumeRuntime,
	createRuntimeGraphFromStatePayload,
	decodePayloadScripts,
	decodePayloadScriptsFromDocument,
	resumeFromPayloadDocument,
	resumeFromPayloadScripts,
	RuntimePayloadError,
} from '../src/index.ts';
import type { ProtocolViewPayload } from '@markless/serializer';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeNode[];
	textContent?: string | null;
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
	preventDefault(): void;
};

type FakePayloadScript = {
	readonly textContent: string;
};

type FakePayloadDocument = {
	readonly scripts: Record<string, FakePayloadScript | undefined>;
	querySelector(selector: string): FakePayloadScript | null;
};

function element(tagName: string, childNodes: FakeNode[] = []): FakeElement {
	return {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
}

function comment(data: string): FakeComment {
	return {
		nodeType: 8,
		data,
	};
}

function payloadDocument(stateScript: string, viewScript: string): FakePayloadDocument {
	return {
		scripts: {
			'script[type="markless/state"]': { textContent: scriptContent(stateScript) },
			'script[type="markless/view"]': { textContent: scriptContent(viewScript) },
		},
		querySelector(selector) {
			return this.scripts[selector] ?? null;
		},
	};
}

function scriptContent(script: string): string {
	return script.replace(/^<script type="markless\/(?:state|view)">/, '').replace('</script>', '');
}

async function settleMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

test('runtime decodes async payload scripts into graph state and resume view records', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
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
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const decoded = decodePayloadScripts({
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
	});
	const graph = await createRuntimeGraphFromStatePayload(decoded.state);
	const loadedSymbols: string[] = [];
	const resume = createResumeRuntime({
		root,
		graph,
		view: decoded.view,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph: runtimeGraph }) => {
				runtimeGraph.write({ graphNodeId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

	await resume.start();

	const keydown: FakeEvent = {
		type: 'keydown',
		target: input,
		key: 'Escape',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(graph.read('state:menu', ['open'])).toBe(false);
});

test('runtime decodes async payload scripts from a document-like script lookup', () => {
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	expect(
		decodePayloadScriptsFromDocument(payloadDocument(scripts.stateScript, scripts.viewScript)),
	).toEqual({
		state,
		view,
	});
});

test('runtime decodes shared definition metadata from async state payload scripts', async () => {
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				name: 'data',
				valueKind: 'object',
				value: {
					status: 'anonymous',
					user: {
						name: 'Ada',
					},
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
					{
						kind: 'graph',
						name: 'user',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['user'],
					},
					{
						kind: 'method',
						name: 'logout',
					},
				],
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const decoded = decodePayloadScripts(scripts);
	const graph = await createRuntimeGraphFromStatePayload(decoded.state);

	expect(decoded.state.sharedDefinitions).toEqual([
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
				{
					kind: 'graph',
					name: 'user',
					graphNodeId: 'shared:src/session.tsrx#session/state:data',
					path: ['user'],
				},
				{
					kind: 'method',
					name: 'logout',
				},
			],
		},
	]);
	expect(graph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			id: 'shared:src/session.tsrx#session',
			name: 'session',
			version: 0,
		}),
	);
	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('anonymous');
	expect(graph.takeSharedPatches()).toEqual([]);
	expect(
		graph.writeShared({
			definitionId: 'shared:src/session.tsrx#session',
			propertyName: 'status',
			value: 'ready',
		}),
	).toBe(true);
	expect(graph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			version: 1,
		}),
	);
	expect(graph.takeSharedPatches()).toEqual([
		{
			id: 'shared:src/session.tsrx#session',
			scope: 'page',
			version: 1,
			patch: [['set', ['status'], 'ready']],
		},
	]);
	expect(graph.takeSharedPatches()).toEqual([]);
	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('ready');
	expect(graph.read('shared:src/session.tsrx#session/state:data', ['status'])).toBe('ready');
	expect(
		graph.writeShared({
			definitionId: 'shared:src/session.tsrx#session',
			propertyName: 'user',
			path: ['name'],
			value: 'Grace',
		}),
	).toBe(true);
	expect(graph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			version: 2,
		}),
	);
	expect(graph.takeSharedPatches()).toEqual([
		{
			id: 'shared:src/session.tsrx#session',
			scope: 'page',
			version: 2,
			patch: [['set', ['user', 'name'], 'Grace']],
		},
	]);
	expect(graph.readShared('shared:src/session.tsrx#session', 'user', ['name'])).toBe('Grace');
	expect(graph.read('shared:src/session.tsrx#session/state:data', ['user', 'name'])).toBe(
		'Grace',
	);
	expect(
		graph.writeShared({
			definitionId: 'shared:src/session.tsrx#session',
			propertyName: 'logout',
			value: 'ignored',
		}),
	).toBe(false);
	expect(graph.takeSharedPatches()).toEqual([]);
});

test('runtime folds received shared patch records into decoded graph state', async () => {
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				name: 'data',
				valueKind: 'object',
				value: {
					status: 'anonymous',
					user: {
						name: 'Ada',
					},
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
					{
						kind: 'graph',
						name: 'user',
						graphNodeId: 'shared:src/session.tsrx#session/state:data',
						path: ['user'],
					},
				],
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	const sourceGraph = await createRuntimeGraphFromStatePayload(decoded.state);
	const receiverGraph = await createRuntimeGraphFromStatePayload(decoded.state);

	sourceGraph.writeShared({
		definitionId: 'shared:src/session.tsrx#session',
		propertyName: 'user',
		path: ['name'],
		value: 'Grace',
	});
	const [patch] = sourceGraph.takeSharedPatches();

	expect(receiverGraph.applySharedPatch(patch!)).toBe(true);
	expect(receiverGraph.readShared('shared:src/session.tsrx#session', 'user', ['name'])).toBe(
		'Grace',
	);
	expect(receiverGraph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			version: 1,
		}),
	);
	expect(receiverGraph.takeSharedPatches()).toEqual([]);
	expect(receiverGraph.applySharedPatch(patch!)).toBe(false);
	expect(receiverGraph.applySharedPatch({ ...patch!, version: 2, patch: [] })).toBe(false);
	expect(receiverGraph.getSharedDefinition('shared:src/session.tsrx#session')).toEqual(
		expect.objectContaining({
			version: 1,
		}),
	);
});

test('runtime decodes serialized behavior input values from markless/view scripts', () => {
	const state = createProtocolStatePayload({ cells: [] });
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'canvas' }],
		events: [],
		domUpdates: [],
		behaviors: [
			{
				hostNodeId: 'h0',
				source: 'chart(config)',
				functionSource: 'chart',
				inputSources: ['config'],
				inputValues: [{ color: 'red' }],
				inputGraphReads: [
					{
						inputIndex: 0,
						source: 'config',
						graphNodeId: 'state:config',
						path: [],
					},
				],
				symbolId: 'symbol:chart',
			},
		],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });

	expect(decodePayloadScripts(scripts).view.behaviors).toEqual([
		{
			hostNodeId: 'h0',
			source: 'chart(config)',
			functionSource: 'chart',
			inputSources: ['config'],
			inputValues: [{ color: 'red' }],
			inputGraphReads: [
				{
					inputIndex: 0,
					source: 'config',
					graphNodeId: 'state:config',
					path: [],
				},
			],
			symbolId: 'symbol:chart',
		},
	]);
});

test('payload document resume applies DOM journal entries through markless/view locators by default', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [],
		domUpdates: [
			{
				hostNodeId: 'h1',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:domUpdate',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const resumed = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol() {
			return (context) =>
				createDomUpdateEntry({
					locator: context.domUpdate!.hostNodeId,
					target: context.domUpdate!.target!,
					value: context.value,
				});
		},
	});

	resumed.graph.write({ graphNodeId: 'state:count', value: 1 });
	await resumed.graph.flush();

	expect(button.textContent).toBe('1');
	expect(resumed.graph.takeJournal()).toEqual([]);
});

test('payload script resume loads async computed runner symbols only when demanded', async () => {
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const runnerInputs: Array<{
		readonly key: unknown;
		readonly signal: AbortSignal | undefined;
		readonly readValue: unknown;
	}> = [];
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:userId',
				name: 'userId',
				valueKind: 'scalar',
				value: 'ada',
			},
		],
		computed: [
			{
				graphNodeId: 'computed:details',
				name: 'details',
				async: true,
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
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
	};
	const scripts = renderPayloadScripts({ state, view });
	const resumed = await resumeFromPayloadScripts({
		root,
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async (context) => {
				const readValue = context.read?.('state:userId', []);
				runnerInputs.push({
					key: context.key,
					signal: context.signal,
					readValue,
				});
				return { title: `User ${String(readValue)}` };
			};
		},
	});

	expect(loadedSymbols).toEqual([]);

	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 1,
		key: 'ada',
	});
	expect(loadedSymbols).toEqual(['symbol:details-runner']);

	await settleMicrotasks();
	await resumed.graph.flush();

	expect(runnerInputs).toEqual([
		expect.objectContaining({
			key: 'ada',
			readValue: 'ada',
		}),
	]);
	expect(runnerInputs[0]?.signal).toBeInstanceOf(AbortSignal);
	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 1,
		key: 'ada',
		value: { title: 'User ada' },
	});
	expect(resumed.graph.takeJournal()).toEqual([]);
});

test('payload script resume restores fulfilled async computed snapshots before revalidation', async () => {
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:userId',
				name: 'userId',
				valueKind: 'scalar',
				value: 'ada',
			},
		],
		computed: [
			{
				graphNodeId: 'computed:details',
				name: 'details',
				async: true,
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				snapshot: {
					status: 'fulfilled',
					version: 1,
					key: 'ada',
					value: { title: 'User ada' },
				},
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
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
	const scripts = renderPayloadScripts({ state, view });
	const resumed = await resumeFromPayloadScripts({
		root,
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async (context) => ({ title: `User ${String(context.key)}` });
		},
	});

	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 1,
		key: 'ada',
		value: { title: 'User ada' },
	});
	expect(loadedSymbols).toEqual([]);

	resumed.graph.write({ graphNodeId: 'state:userId', value: 'grace' });
	await resumed.graph.flush();

	expect(loadedSymbols).toEqual(['symbol:details-runner']);

	await settleMicrotasks();
	await resumed.graph.flush();

	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 'grace',
		value: { title: 'User grace' },
	});
});

test('payload script resume restarts pending async computed snapshots on demand', async () => {
	const start = comment('async:boundary:0:start');
	const paragraph = element('P');
	const end = comment('async:boundary:0:end');
	const root = element('SECTION', [start, paragraph, end]);
	const loadedSymbols: string[] = [];
	const runnerInputs: Array<{ readonly key: unknown; readonly readValue: unknown }> = [];
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:userId',
				name: 'userId',
				valueKind: 'scalar',
				value: 'ada',
			},
		],
		computed: [
			{
				graphNodeId: 'computed:details',
				name: 'details',
				async: true,
				dependencies: [{ graphNodeId: 'state:userId', path: [] }],
				snapshot: {
					status: 'pending',
					version: 3,
					key: 'ada',
				},
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
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
	const scripts = renderPayloadScripts({ state, view });
	const resumed = await resumeFromPayloadScripts({
		root,
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return async (context) => {
				const readValue = context.read?.('state:userId', []);
				runnerInputs.push({ key: context.key, readValue });
				return { title: `User ${String(readValue)}` };
			};
		},
	});

	expect(loadedSymbols).toEqual([]);
	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'pending',
		version: 4,
		key: 'ada',
	});
	expect(loadedSymbols).toEqual(['symbol:details-runner']);

	await settleMicrotasks();
	await resumed.graph.flush();

	expect(runnerInputs).toEqual([{ key: 'ada', readValue: 'ada' }]);
	expect(resumed.graph.read('computed:details')).toEqual({
		status: 'fulfilled',
		version: 4,
		key: 'ada',
		value: { title: 'User ada' },
	});
});

test('runtime rejects payload scripts missing required state or view fields', () => {
	const validState =
		'<script type="markless/state">{"version":1,"cells":[],"computed":[]}</script>';
	const validView =
		'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: '<script type="markless/state">{"version":1}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state payload: expected cells array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: '<script type="markless/state">{"version":1,"cells":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state payload: expected computed array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript: '<script type="markless/view">{"version":1,"locators":[]}</script>',
		}),
	).toThrow('Invalid markless/view payload: expected events array.');
});

test('runtime rejects payload scripts with malformed serialized state values', () => {
	const validView =
		'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[],"computed":[],"sharedDefinitions":[{"id":"shared:src/session.tsrx#session","name":"session","exportedName":"session","version":-1,"graphNodeIds":[]}]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state sharedDefinitions[0]: expected version non-negative integer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:count","name":"count","valueKind":"scalar","value":{"version":1,"root":0}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value: expected records array.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:user","name":"user","valueKind":"object","value":{"version":1,"root":{"$type":"unknown"},"records":[]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.root: expected serialized slot.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:count","name":"count","valueKind":"scalar","value":{"version":1,"root":{"$type":"bigint","value":"not-a-bigint"},"records":[]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.root: expected bigint string.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:pattern","name":"pattern","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"regexp","source":"[","flags":""}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state cell[0].value.records[0]: expected valid regexp pattern and flags.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[],"computed":[{"graphNodeId":"computed:details","name":"details","async":true,"snapshot":{"status":"fulfilled","version":1,"key":{"version":1,"root":"ada","records":[]},"value":{"version":1,"records":[]}}}]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state computed[0].snapshot.value: expected root.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[],"computed":[{"graphNodeId":"computed:details","name":"details","async":true,"snapshot":{"status":"pending","version":1.5,"key":{"version":1,"root":"ada","records":[]}}}]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state computed[0].snapshot: expected version non-negative integer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[],"computed":[{"graphNodeId":"computed:details","name":"details","async":true,"snapshot":{"status":"pending","version":-1,"key":{"version":1,"root":"ada","records":[]}}}]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state computed[0].snapshot: expected version non-negative integer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"typed-array","arrayType":"UnknownArray","buffer":{"$ref":1},"byteOffset":0,"length":1},{"id":1,"type":"array-buffer","bytes":[1]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state cell[0].value.records[0]: expected supported typed array type.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:user","name":"user","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"object","fields":[]},{"id":0,"type":"object","fields":[]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.records[1]: duplicate record id 0.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:user","name":"user","valueKind":"object","value":{"version":1,"root":{"$ref":1},"records":[{"id":0,"type":"object","fields":[]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.root: unknown record ref 1.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:user","name":"user","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0.5,"type":"object","fields":[]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.records[0]: expected id non-negative integer.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"array-buffer","bytes":[256]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.records[0]: expected bytes byte array.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"typed-array","arrayType":"Uint8Array","buffer":null,"byteOffset":0,"length":1}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.records[0]: expected buffer array-buffer ref.');

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"typed-array","arrayType":"Uint16Array","buffer":{"$ref":1},"byteOffset":1,"length":1},{"id":1,"type":"array-buffer","bytes":[0,1,2,3]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state cell[0].value.records[0]: typed-array byteOffset must align to element byte length.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"typed-array","arrayType":"Uint16Array","buffer":{"$ref":1},"byteOffset":0,"length":2},{"id":1,"type":"array-buffer","bytes":[0,1]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state cell[0].value.records[0]: typed-array byte range exceeds referenced array-buffer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:bytes","name":"bytes","valueKind":"object","value":{"version":1,"root":{"$ref":0},"records":[{"id":0,"type":"data-view","buffer":{"$ref":1},"byteOffset":1,"byteLength":2},{"id":1,"type":"array-buffer","bytes":[0,1]}]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow(
		'Invalid markless/state cell[0].value.records[0]: data-view byte range exceeds referenced array-buffer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":1,"cells":[{"graphNodeId":"state:user","name":"user","valueKind":"object","value":{"version":1,"root":{"$ref":-1},"records":[]}}],"computed":[]}</script>',
			viewScript: validView,
		}),
	).toThrow('Invalid markless/state cell[0].value.root: expected $ref non-negative integer.');
});

test('runtime rejects payload scripts with malformed nested view records', () => {
	const validState =
		'<script type="markless/state">{"version":1,"cells":[],"computed":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[{"strategy":"dom-order","index":0,"tagName":"section"}],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view locator[0]: expected hostNodeId string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":-1,"tagName":"section"}],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view locator[0]: expected index non-negative integer.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click"}],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view event[0]: expected symbolIds array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[{"hostNodeId":"h1","source":"count","graphNodeId":"state:count","path":[],"target":{"kind":"attribute"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view domUpdate[0].target: expected attribute name string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[{"hostNodeId":"h1","source":"count","graphNodeId":"state:count","path":[],"target":{"kind":"property"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view domUpdate[0].target: expected property name string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[{"hostNodeId":"h1","source":"count","graphNodeId":"state:count","path":[],"target":{"kind":"class"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).not.toThrow();

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[{"hostNodeId":"h1","source":"count","graphNodeId":"state:count","path":[],"target":{"kind":"style"}}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).not.toThrow();

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[{"hostNodeId":"h1","source":"chart(config)","inputSources":["config"]}],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view behavior[0]: expected functionSource string.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[{"hostNodeId":"h1","source":"chart(config)","functionSource":"chart","inputSources":["config"],"inputValues":{"color":"red"}}],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view behavior[0]: expected inputValues array.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[{"hostNodeId":"h1","source":"chart(config)","functionSource":"chart","inputSources":["config"],"inputGraphReads":[{"inputIndex":"0","source":"config","graphNodeId":"state:config","path":[]}]}],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow(
		'Invalid markless/view behavior[0].inputGraphReads[0]: expected inputIndex non-negative integer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[{"hostNodeId":"h1","source":"chart(config)","functionSource":"chart","inputSources":["config"],"inputGraphReads":[{"inputIndex":0.5,"source":"config","graphNodeId":"state:config","path":[]}]}],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow(
		'Invalid markless/view behavior[0].inputGraphReads[0]: expected inputIndex non-negative integer.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[{"id":"boundary:0","startAnchor":{"strategy":"dom-order-comment","index":0.5},"endAnchor":{"strategy":"dom-order-comment","index":1},"asyncReads":[]}]}</script>',
		}),
	).toThrow(
		'Invalid markless/view asyncBoundary[0].startAnchor: expected index non-negative integer.',
	);
});

test('runtime rejects payload scripts with malformed sync policy records', () => {
	const validState =
		'<script type="markless/state">{"version":1,"cells":[],"computed":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click","symbolIds":[],"syncPolicy":{"when":{"type":"event-equals","field":"key","value":"Escape"},"actions":["cancel"]}}],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view event[0].syncPolicy: expected supported sync action.');

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[{"hostNodeId":"h1","eventName":"click","symbolIds":[],"syncPolicy":{"when":{"type":"graph-truthy","path":[]},"actions":["preventDefault"]}}],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>',
		}),
	).toThrow('Invalid markless/view event[0].syncPolicy.when: expected graphNodeId string.');
});

test('runtime rejects payload scripts with malformed optional view records', () => {
	const validState =
		'<script type="markless/state">{"version":1,"cells":[],"computed":[]}</script>';

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[],"keyedRepeats":[{"id":"repeat:0","parentHostNodeId":"h0","collectionPath":[],"keyPath":[],"itemName":"row","rowElementCount":1,"rowEvents":[{"hostPath":"0","eventName":"click","symbolIds":[]}]}]}</script>',
		}),
	).toThrow(
		'Invalid markless/view keyedRepeat[0].rowEvents[0]: expected hostPath array.',
	);

	expect(() =>
		decodePayloadScripts({
			stateScript: validState,
			viewScript:
				'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[],"branches":[{"id":"branch:0","startAnchor":{"strategy":"dom-order-comment","index":0},"endAnchor":{"strategy":"dom-order-comment","index":1},"testReads":[{"source":"open","path":[]}]}]}</script>',
		}),
	).toThrow('Invalid markless/view branch[0].testReads[0]: expected graphNodeId string.');
});

test('runtime payload decode errors expose structured payload diagnostics', () => {
	const validView =
		'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';
	const error = captureThrown(() =>
		decodePayloadScripts({
			stateScript: '{"version":1,"cells":[]}',
			viewScript: validView,
		}),
	);

	expect(error).toBeInstanceOf(RuntimePayloadError);
	expect(error).toMatchObject({
		code: 'MARKLESS_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		payloadType: 'markless/state',
		payloadScript: 'script[type="markless/state"]',
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
		suggestions: [
			{
				message: expect.stringContaining('markless/state'),
			},
		],
	});
	expect(error).toMatchObject({
		message: 'Expected markless/state payload script.',
		why: expect.stringContaining('markless/state'),
	});
});

test('runtime protocol version mismatch errors expose expected and actual versions', () => {
	const validView =
		'<script type="markless/view">{"version":1,"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';
	const error = captureThrown(() =>
		decodePayloadScripts({
			stateScript:
				'<script type="markless/state">{"version":2,"cells":[],"computed":[]}</script>',
			viewScript: validView,
		}),
	);

	expect(error).toBeInstanceOf(RuntimePayloadError);
	expect(error).toMatchObject({
		code: 'MARKLESS_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		payloadType: 'markless/state',
		payloadScript: 'script[type="markless/state"]',
		expectedVersion: 1,
		actualVersion: 2,
		docsUrl: 'https://markless.dev/errors/MARKLESS_PROTOCOL_VERSION_MISMATCH',
	});
	expect(error).toMatchObject({
		message: 'Unsupported markless/state protocol version 2.',
		why: expect.stringContaining('version 1'),
	});
});

test('runtime resumes directly from async payload scripts', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
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
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const loadedSymbols: string[] = [];
	const resumed = await resumeFromPayloadScripts({
		root,
		stateScript: scripts.stateScript,
		viewScript: scripts.viewScript,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph }) => {
				graph.write({ graphNodeId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

	expect(root.listeners).toEqual([
		expect.objectContaining({
			type: 'keydown',
			options: { capture: true },
		}),
	]);

	const keydown: FakeEvent = {
		type: 'keydown',
		target: input,
		key: 'Escape',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(resumed.graph.read('state:menu', ['open'])).toBe(false);
	expect(resumed.runtime.getElement('h1')).toBe(input);
	expect(resumed.decoded.view).toEqual(view);
});

test('runtime resumes from async payload scripts found in a document-like root', async () => {
	const input = element('INPUT');
	const root = element('SECTION', [input]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:menu',
				name: 'menu',
				valueKind: 'object',
				value: { open: true },
			},
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
		],
		events: [
			{
				hostNodeId: 'h1',
				eventName: 'keydown',
				syncPolicy: {
					when: { type: 'event-equals', field: 'key', value: 'Escape' },
					actions: ['preventDefault'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const loadedSymbols: string[] = [];
	const resumed = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			return ({ graph }) => {
				graph.write({ graphNodeId: 'state:menu', path: ['open'], value: false });
			};
		},
	});

	const keydown: FakeEvent = {
		type: 'keydown',
		target: input,
		key: 'Escape',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
	};
	await root.listeners[0].listener(keydown);

	expect(keydown.defaultPrevented).toBe(true);
	expect(loadedSymbols).toEqual(['symbol:key']);
	expect(resumed.graph.read('state:menu', ['open'])).toBe(false);
	expect(resumed.decoded.state).toEqual(state);
	expect(resumed.decoded.view).toEqual(view);
});

test('runtime treats a second payload resume for one container as an already-resumed no-op warning', async () => {
	const button = element('BUTTON');
	const root = element('SECTION', [button]);
	const state = createProtocolStatePayload({
		cells: [
			{
				graphNodeId: 'state:count',
				name: 'count',
				valueKind: 'scalar',
				value: 0,
			},
		],
	});
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
	const scripts = renderPayloadScripts({ state, view });
	const first = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol: () => () => undefined,
	});

	expect((root as FakeElement & { __asyncResumeRuntimeStarted?: boolean }).__asyncResumeRuntimeStarted).toBe(
		true,
	);

	const second = await resumeFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		loadSymbol: () => {
			throw new Error('second resume must not wire a new runtime');
		},
	});

	expect(second.runtime).toBe(first.runtime);
	expect(second.graph).toBe(first.graph);
	expect(root.listeners).toHaveLength(1);
	expect(second.warnings).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_RESUME_ALREADY_RESUMED',
			severity: 'warning',
			phase: 'resume',
			title: 'This container was already resumed',
			docsUrl: 'https://markless.dev/errors/MARKLESS_RESUME_ALREADY_RESUMED',
		}),
	]);
});

function captureThrown(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}

	throw new Error('Expected callback to throw.');
}

test('resumeFromPayloadDocument builds branch flip fragments through the document template', async () => {
	const { resumeFromPayloadDocument } = await import('../src/payload.ts');
	const startComment = {
		nodeType: 8 as const,
		textContent: 'markless:branch:branch-site:0',
		parentNode: null as unknown,
	};
	const endComment = {
		nodeType: 8 as const,
		textContent: '/markless:branch:branch-site:0',
		parentNode: null as unknown,
	};
	const shown = fakeElement('P');
	const root = fakeElement('MAIN', [startComment, shown, endComment]);
	const state = JSON.stringify({
		version: 1,
		cells: [
			{
				graphNodeId: 'state:open',
				name: 'open',
				valueKind: 'scalar',
				value: { version: 1, root: true, records: [] },
			},
		],
		computed: [],
	});
	const view = JSON.stringify({
		version: 1,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
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
		],
	});
	const insertedTag = 'SPAN';
	const templateNodes = [fakeElement(insertedTag)];
	const template = {
		innerHTML: '',
		content: { childNodes: templateNodes },
	};
	const documentFake = {
		querySelector(selector: string) {
			if (selector.includes('markless/state')) return { textContent: state };
			if (selector.includes('markless/view')) return { textContent: view };
			return null;
		},
		createElement(tagName: string) {
			expect(tagName).toBe('template');
			return template;
		},
	};

	const result = await resumeFromPayloadDocument({
		document: documentFake as never,
		root: root as never,
		loadSymbol: () => () => ({ arm: 1, html: '<span>Hidden</span>' }),
	});

	result.graph.write({ graphNodeId: 'state:open', value: false });
	await result.graph.flush?.();

	// The default fragment builder parsed the flip html via the document
	// template and inserted the resulting node between the anchors.
	expect(
		root.childNodes.map((child) => (child as { tagName?: string }).tagName ?? '#comment'),
	).toEqual(['#comment', insertedTag, '#comment']);
});

function fakeElement(tagName: string, childNodes: unknown[] = []) {
	const node = {
		nodeType: 1 as const,
		tagName,
		childNodes: childNodes as Array<Record<string, unknown>>,
		listeners: [] as unknown[],
		addEventListener() {},
		removeChild(child: Record<string, unknown>) {
			const index = node.childNodes.indexOf(child);
			if (index >= 0) node.childNodes.splice(index, 1);
			(child as { parentNode?: unknown }).parentNode = null;
			return child;
		},
		insertBefore(child: Record<string, unknown>, before: Record<string, unknown> | null) {
			const index = before ? node.childNodes.indexOf(before) : -1;
			(child as { parentNode?: unknown }).parentNode = node;
			node.childNodes.splice(index >= 0 ? index : node.childNodes.length, 0, child);
			return child;
		},
	};
	for (const child of childNodes as Array<{ parentNode?: unknown }>) child.parentNode = node;
	return node;
}

test('payload document resume settles pending async boundaries through the default journal applier', async () => {
	const { resumeFromPayloadDocument } = await import('../src/payload.ts');
	const startComment = {
		nodeType: 8 as const,
		textContent: 'markless:async:boundary:0',
		parentNode: null as unknown,
	};
	const endComment = {
		nodeType: 8 as const,
		textContent: '/markless:async:boundary:0',
		parentNode: null as unknown,
	};
	const pending = fakeElement('P');
	const root = fakeElement('MAIN', [startComment, pending, endComment]);
	const loadedSymbols: string[] = [];
	const state =
		'{"version":1,"cells":[{"graphNodeId":"state:userId","name":"userId","valueKind":"scalar","value":{"version":1,"root":"ada","records":[]}}],"computed":[{"graphNodeId":"computed:details","name":"details","async":true,"dependencies":[{"graphNodeId":"state:userId","path":[]}]}]}';
	const view =
		'{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"main"}],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[],"asyncBoundaries":[{"id":"boundary:0","updateSymbolId":"symbol:boundary-update","startAnchor":{"strategy":"dom-order-comment","index":0},"endAnchor":{"strategy":"dom-order-comment","index":1},"asyncReads":[{"source":"details","graphNodeId":"computed:details","path":[],"runnerSymbolId":"symbol:details-runner"}]}]}';
	const insertedTag = 'SPAN';
	const template = { innerHTML: '', content: { childNodes: [fakeElement(insertedTag)] } };
	const documentFake = {
		querySelector(selector: string) {
			if (selector.includes('markless/state')) return { textContent: state };
			if (selector.includes('markless/view')) return { textContent: view };
			return null;
		},
		createElement: () => template,
	};

	const result = await resumeFromPayloadDocument({
		document: documentFake as never,
		root: root as never,
		loadSymbol(symbolId) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:details-runner') {
				return async (context) => ({ title: `User ${String(context.key)}` });
			}
			return ({ graph, status }) => ({
				arm: status === 'rejected' ? 1 : 0,
				html: `<span>${String(graph.read('computed:details', ['value', 'title']))}</span>`,
			});
		},
	});

	await settleMicrotasks();
	await result.graph.flush();
	await settleMicrotasks();

	// The unsettled CSR boundary demanded its runner at creation, and the
	// default applier resolved the async-boundary range anchors and inserted
	// the settled arm parsed through the document template.
	expect(loadedSymbols).toEqual(['symbol:details-runner', 'symbol:boundary-update']);
	expect(template.innerHTML).toBe('<span>User ada</span>');
	expect(
		root.childNodes.map((child) => (child as { tagName?: string }).tagName ?? '#comment'),
	).toEqual(['#comment', insertedTag, '#comment']);
});
