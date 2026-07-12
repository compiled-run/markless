import { createRuntimeGraph } from '@markless/runtime';
import { beforeEach, describe, expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import {
	__marklessDebugRecordViolation,
	__marklessDebugInvalidateElement,
	__marklessDebugRegisterRouter,
	__marklessDebugResetForTest,
	__marklessDebugStartContainer,
} from '../src/debug-channel.ts';
import type { MarklessDebugChannelV1 } from '../src/debug-channel.ts';
import { resumeScalarCoreEventFromPayloadDocument } from '../src/event-only-lean/scalar-core.ts';
import { resumeScalarRowEventFromPayloadDocument } from '../src/event-only-lean/row.ts';
import { marklessCsrAttachPropEvent } from '../src/fns/csr.ts';
import { attachMarklessPublicStaticEvents } from '../src/fns/direct.ts';
import { createResumeRuntime } from '../src/index.ts';
import { renderCsrRuntime } from '../src/render-csr.ts';
import { renderToStream } from '../src/render-to-stream.ts';
import { renderToString } from '../src/render-to-string.ts';
import { createResumeRuntime as createDebugResumeRuntime } from '../src/resume-runtime.ts';

function requiredScriptContent(text: string, pattern: RegExp): string {
	const match = text.match(pattern);
	if (!match || match[1] === undefined)
		throw new Error('expected script content matching ' + String(pattern));
	return match[1];
}

type FakeElement = {
	nodeType: 1;
	tagName: string;
	childNodes: FakeElement[];
	parentElement?: FakeElement | null;
	isConnected: boolean;
	listeners: Map<string, unknown[]>;
	textContent?: string | null;
	addEventListener(type: string, listener: unknown): void;
	removeEventListener(type: string, listener: unknown): void;
	contains(element: FakeElement): boolean;
};
function element(tag: string, children: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName: tag,
		childNodes: children,
		isConnected: true,
		listeners: new Map(),
		addEventListener(type, listener) {
			this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
		},
		removeEventListener(type, listener) {
			this.listeners.set(
				type,
				(this.listeners.get(type) ?? []).filter((value) => value !== listener),
			);
		},
		contains(candidate) {
			return this === candidate || this.childNodes.some((child) => child.contains(candidate));
		},
	};
	for (const child of children) child.parentElement = node;
	return node;
}
const channel = () =>
	(globalThis as typeof globalThis & { __MARKLESS_DEBUG__?: MarklessDebugChannelV1 })
		.__MARKLESS_DEBUG__;
const inlineHtml = () =>
	renderToString(
		{
			resumeModuleUrl: '/resume.js',
			renderSsr: () => ({
				html: '<button>Wake</button>',
				state: { version: 1, cells: [], computed: [] },
				view: {
					version: 1,
					locators: [
						{ hostNodeId: 'wake', strategy: 'dom-order', index: 0, tagName: 'button' },
					],
					events: [{ hostNodeId: 'wake', eventName: 'click', symbolIds: ['wake'] }],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [],
				},
			}),
		} as never,
		{ executionLog: 'never' },
	);
function executeInline(html: string, root: FakeElement, nodes: FakeElement[]) {
	const source = requiredScriptContent(html, /<script data-async-resumer>([\s\S]*?)<\/script>/);
	const payload = requiredScriptContent(
		html,
		/<script type="markless\/view">([\s\S]*?)<\/script>/,
	);
	(root as any).querySelector = () => ({ textContent: payload });
	const prior = (globalThis as any).document;
	let index = 0;
	(globalThis as any).document = {
		currentScript: { closest: () => root },
		createTreeWalker: () => ({ nextNode: () => nodes[index++] }),
	};
	try {
		new Function(source)();
	} finally {
		(globalThis as any).document = prior;
	}
}
function streamArtifact() {
	let settled = false,
		entry: any;
	return {
		resumeModuleUrl: '/resume.js',
		renderSsr(_props?: unknown, context?: any) {
			if (context?.streaming?.prestart && !entry) {
				entry = {};
				entry.promise = new Promise((resolve) =>
					setTimeout(() => {
						settled = true;
						entry.settled = { status: 'fulfilled' };
						resolve('ready');
					}, 20),
				);
				context.streaming.runs.set('computed:stream', entry);
			}
			const snapshot = settled
				? { status: 'fulfilled', version: 1, key: 0, value: 'ready' }
				: { status: 'pending', version: 1, key: 0 };
			const armRecords = settled
				? {
						locators: [
							{
								hostNodeId: 'stream-button',
								strategy: 'arm-relative',
								index: 2,
								tagName: 'button',
							},
						],
						events: [
							{
								hostNodeId: 'stream-button',
								eventName: 'click',
								symbolIds: ['stream'],
							},
						],
						behaviors: [],
						elementHandles: [],
					}
				: { locators: [], events: [], behaviors: [], elementHandles: [] };
			return {
				html: `<main><!--markless:async:stream-->${settled ? '<article><span>quiet</span><button>Wake</button></article>' : '<p>Waiting</p>'}<!--/markless:async:stream--></main>`,
				state: {
					version: 1,
					cells: [],
					computed: [
						{ graphNodeId: 'computed:stream', name: 'stream', async: true, snapshot },
					],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'stream',
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [{ graphNodeId: 'computed:stream', path: [] }],
							armRecords,
						},
					],
				},
			};
		},
	};
}
function payloadDocument(state: any, view: any) {
	const scripts = renderPayloadScripts({ state, view });
	return {
		querySelector(selector: string) {
			const source = selector.includes('state') ? scripts.stateScript : scripts.viewScript;
			return { textContent: source.replace(/^<script[^>]*>/, '').replace('</script>', '') };
		},
	};
}
beforeEach(() => {
	(globalThis as any).__MARKLESS_DEBUG_ENABLED__ = true;
	__marklessDebugResetForTest();
});

describe('debug registration mirrors successful framework wiring', () => {
	test('explains a marked eligible anchor in an active CSR container from SPA delegation', () => {
		const root = element('MAIN');
		const link = {
			...element('A'),
			parentElement: root,
			href: 'http://localhost/about',
			hasAttribute: (name: string) => name === 'data-markless-router-link',
			getAttribute: () => null,
			relList: { contains: () => false },
			closest: (selector: string) => (selector === 'a[href]' ? link : null),
		};
		root.childNodes.push(link);
		__marklessDebugStartContainer(root as never, 'csr');
		__marklessDebugRegisterRouter(undefined, 'spa-click-listener');
		__marklessDebugInvalidateElement(root as never, link as never);
		expect(channel()?.explainInteraction(link as never, 'click')).toMatchObject({
			kind: 'router-delegation',
			source: 'spa-click-listener',
		});
	});

	test('executes inline registration and an absent-locator full-resume handoff', async () => {
		const button = element('BUTTON'),
			root = element('MAIN', [button]);
		executeInline(await inlineHtml(), root, [button]);
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			kind: 'inline-resumer',
			source: 'ssr-inline',
		});
		__marklessDebugResetForTest();
		executeInline(await inlineHtml(), root, []);
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			kind: 'none',
		});
		const Original = globalThis.WeakRef;
		(globalThis as any).WeakRef = class {
			constructor() {
				throw new Error('debug failed');
			}
		};
		const neutralButton = element('BUTTON'),
			neutralRoot = element('MAIN', [neutralButton]);
		try {
			__marklessDebugResetForTest();
			executeInline(await inlineHtml(), neutralRoot, [neutralButton]);
			expect(neutralRoot.listeners.get('click')).toHaveLength(1);
		} finally {
			globalThis.WeakRef = Original;
		}
	});

	test('fully strips unflagged streamed preparation and executes flagged arm registration', async () => {
		(globalThis as any).__MARKLESS_DEBUG_ENABLED__ = false;
		const plain = await renderToStream(streamArtifact() as never);
		let plainOutput = '';
		for await (const value of plain.appends()) plainOutput += value;
		expect(plainOutput).not.toContain('const nodes = [r]');
		(globalThis as any).__MARKLESS_DEBUG_ENABLED__ = true;
		const stream = await renderToStream(streamArtifact() as never);
		let chunk = '';
		for await (const value of stream.appends()) chunk += value;
		const source = requiredScriptContent(
			chunk,
			/<script data-markless-stream-executor>([\s\S]*?)<\/script>/,
		);
		const records = requiredScriptContent(
			chunk,
			/<script type="markless\/arm"[^>]*>([\s\S]*?)<\/script>/,
		);
		const sibling = element('SPAN'),
			button = element('BUTTON'),
			article = element('ARTICLE', [sibling, button]),
			root = element('MAIN', [article]);
		const parent: any = { childNodes: [] as any[], removeChild() {}, insertBefore() {} };
		const start: any = {
				nodeType: 8,
				data: 'markless:async:stream',
				parentNode: parent,
				parentElement: root,
			},
			end: any = {
				nodeType: 8,
				data: '/markless:async:stream',
				parentNode: parent,
				parentElement: root,
			};
		parent.childNodes = [start, end];
		(root as any).closest = () => root;
		const prior = [
			(globalThis as any).document,
			globalThis.performance,
			(globalThis as any).requestAnimationFrame,
		];
		delete (globalThis as any).__mArm;
		(globalThis as any).document = {
			body: {},
			querySelector: (selector: string) =>
				selector.startsWith('template')
					? { content: {}, remove() {} }
					: { textContent: records },
			createTreeWalker(target: unknown) {
				const nodes =
					target === root ? [start, article, sibling, button, end] : [start, end];
				let index = 0;
				return { nextNode: () => nodes[index++] };
			},
		};
		(globalThis as any).performance = { now: () => 0, getEntriesByName: () => [] };
		(globalThis as any).requestAnimationFrame = (run: () => void) => run();
		try {
			new Function(source)();
			(globalThis as any).__mArm('stream');
		} finally {
			[
				(globalThis as any).document,
				(globalThis as any).performance,
				(globalThis as any).requestAnimationFrame,
			] = prior;
		}
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			kind: 'inline-resumer',
			source: 'streamed-arm',
		});
		expect(channel()?.explainInteraction(sibling as never, 'click')).toMatchObject({
			kind: 'none',
		});
	});

	test('covers full records, missing host, row reorder/removal, replacement, and disposal', async () => {
		const button = element('BUTTON'),
			rowButton = element('BUTTON'),
			root = element('MAIN', [button, rowButton]);
		executeInline(await inlineHtml(), root, []);
		const graph = createRuntimeGraph({ cells: [] });
		const runtime = createResumeRuntime({
			root: root as never,
			graph,
			view: {
				version: 1,
				locators: [
					{ hostNodeId: 'root', strategy: 'dom-order', index: 0, tagName: 'main' },
					{ hostNodeId: 'button', strategy: 'dom-order', index: 1, tagName: 'button' },
				],
				events: [
					{ hostNodeId: 'button', eventName: 'click', symbolIds: ['click'] },
					{ hostNodeId: 'missing', eventName: 'blur', symbolIds: ['missing'] },
				],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [],
				branches: [],
				asyncBoundaries: [],
			},
			loadSymbol: () => () => {},
		});
		await runtime.start();
		expect(channel()?.containers[0]).toMatchObject({
			phase: 'ssr-resume',
			lifecycle: 'active',
		});
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			kind: 'resume-record',
		});
		expect(channel()?.violations).toContainEqual(
			expect.objectContaining({ code: 'MARKLESS_DEBUG_EVENT_HOST_MISSING' }),
		);
		const wiring = (await import('../src/resume-events.ts')).createEventWiring({
			root: root as never,
			graph,
			loadSymbol: () => () => {},
			elementsByHostId: new Map(),
			elementHandles: { get: () => undefined } as never,
			view: {} as never,
			eventTypes: new Set(),
			disposedHosts: new Set(),
			ignoredDisposedEventTargets: new WeakSet(),
			prepareRuntimeShared: async () => {},
			flushRuntimeGraph: async () => {},
			reportRuntimeError: async () => {},
			activateBehaviorsFromTrigger: () => undefined,
			behaviorHostIdsForAncestors: () => [],
		});
		wiring.addRowEvent(
			rowButton as never,
			{
				repeat: { id: 'rows' },
				rowEvent: { eventName: 'keydown', symbolIds: ['row'] },
			} as never,
		);
		await wiring.whenDebugRegistered();
		root.childNodes.reverse();
		expect(channel()?.explainInteraction(rowButton as never, 'keydown')).toMatchObject({
			kind: 'row-record',
		});
		rowButton.isConnected = false;
		expect(channel()?.explainInteraction(rowButton as never, 'keydown')).toMatchObject({
			reason: 'element-disconnected',
		});
		rowButton.isConnected = true;
		runtime.disposeHost('button');
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			reason: 'not-registered',
		});
		const replacement = element('BUTTON');
		root.childNodes.push(replacement);
		replacement.parentElement = root;
		wiring.addEventRecord(replacement as never, {
			hostNodeId: 'branch:new',
			eventName: 'click',
			symbolIds: ['new'],
		});
		await wiring.whenDebugRegistered();
		expect(channel()?.explainInteraction(replacement as never, 'click')).toMatchObject({
			kind: 'resume-record',
			hostNodeId: 'branch:new',
		});
		runtime.dispose();
		expect(channel()?.explainInteraction(rowButton as never, 'keydown')).toMatchObject({
			reason: 'container-disposed',
		});
	});

	test('deterministically covers direct static and both callback branches without timers', async () => {
		const staticButton = element('BUTTON'),
			callbackButton = element('BUTTON'),
			markedButton = element('BUTTON'),
			falsyButton = element('BUTTON'),
			root = element('MAIN', [staticButton, callbackButton, markedButton, falsyButton]);
		__marklessDebugStartContainer(root as never, 'csr');
		const direct = attachMarklessPublicStaticEvents(root, { flush() {} }, () => () => {}, [
			[[0], 'click', ['static']],
		]);
		const callback = marklessCsrAttachPropEvent(root, [1], 'change', () => {}),
			marked = () => {};
		Object.defineProperty(marked, '__marklessCsrCallbackProp', { value: true });
		const callbackMarker = marklessCsrAttachPropEvent(root, [2], 'input', marked);
		marklessCsrAttachPropEvent(root, [3], 'click', undefined);
		await Promise.all([direct, callback, callbackMarker]);
		expect(channel()?.explainInteraction(staticButton as never, 'click')).toMatchObject({
			kind: 'direct-csr',
			source: 'static-event',
		});
		expect(channel()?.explainInteraction(callbackButton as never, 'change')).toMatchObject({
			kind: 'direct-csr',
			source: 'callback-prop',
		});
		expect(channel()?.explainInteraction(markedButton as never, 'input')).toMatchObject({
			kind: 'direct-csr',
		});
		expect(channel()?.explainInteraction(falsyButton as never, 'click')).toMatchObject({
			kind: 'none',
			reason: 'not-registered',
		});
	});

	test('runs real CSR resume lifecycle through registration and disposal', async () => {
		const button = element('BUTTON'),
			root = element('MAIN', [button]);
		const container = await renderCsrRuntime({
			output: {
				root,
				graph: createRuntimeGraph({ cells: [] }),
				state: { version: 1, cells: [], computed: [] },
				view: {
					version: 1,
					locators: [
						{
							hostNodeId: 'button',
							strategy: 'dom-order',
							index: 1,
							tagName: 'button',
						},
					],
					events: [{ hostNodeId: 'button', eventName: 'click', symbolIds: ['csr'] }],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					keyedRepeats: [],
					branches: [],
					asyncBoundaries: [],
				},
			},
			options: {},
		} as never);
		expect(channel()?.containers[0]).toMatchObject({ phase: 'csr', lifecycle: 'active' });
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			kind: 'resume-record',
		});
		container.runtime.dispose();
		expect(channel()?.explainInteraction(button as never, 'click')).toMatchObject({
			reason: 'container-disposed',
		});
	});

	test('marks scalar and row lean success, then full fallback after its loader succeeds', async () => {
		const button = element('BUTTON'),
			output = element('OUTPUT'),
			root = element('DIV', [element('SECTION', [button, output])]);
		const state = createProtocolStatePayload({
				cells: [{ graphNodeId: 'count', name: 'count', valueKind: 'scalar', value: 0 }],
			}),
			eventRecord = { hostNodeId: 'button', eventName: 'click', symbolIds: ['event'] },
			update = {
				hostNodeId: 'output',
				source: 'count',
				graphNodeId: 'count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'text',
			};
		const view = {
			version: 1,
			locators: [
				{ hostNodeId: 'button', strategy: 'dom-order', index: 2, tagName: 'button' },
				{ hostNodeId: 'output', strategy: 'dom-order', index: 3, tagName: 'output' },
			],
			events: [eventRecord],
			domUpdates: [update],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		};
		const scalarMap = {
			recordKinds: [
				{ kind: 'event', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
			actions: [
				{
					hostNodeId: 'button',
					eventName: 'click',
					recordKind: 'event',
					plan: {
						version: 1,
						kind: 'scalar',
						symbolId: 'event',
						cell: 'count',
						write: { kind: 'assign', value: 1 },
						textUpdates: [
							{ hostNodeId: 'output', graphNodeId: 'count', symbolId: 'text' },
						],
					},
				},
			],
		};
		await resumeScalarCoreEventFromPayloadDocument({
			root,
			document: payloadDocument(state, view),
			event: { type: 'click', target: button },
			eventRecord,
			runtimeDemandMap: scalarMap,
			loadSymbol: () => () => {},
		} as never);
		expect([output.textContent, channel()?.containers[0]?.phase]).toEqual(['1', 'ssr-lean']);
		const rowButton = element('BUTTON'),
			rowOutput = element('OUTPUT'),
			rowRoot = element('DIV', [
				element('SECTION', [element('ARTICLE', [rowButton])]),
				rowOutput,
			]);
		const rowState = createProtocolStatePayload({
			cells: [
				{ graphNodeId: 'chosen', name: 'chosen', valueKind: 'scalar', value: 'none' },
				{
					graphNodeId: 'cards',
					name: 'cards',
					valueKind: 'array',
					value: [{ key: 'north' }],
				},
			],
		});
		const repeat = {
				id: 'repeat',
				parentHostNodeId: 'parent',
				collectionGraphNodeId: 'cards',
				collectionPath: [],
				keyPath: ['key'],
				itemName: 'card',
				rowElementCount: 1,
				rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['row'] }],
			},
			rowUpdate = {
				hostNodeId: 'row-output',
				source: 'chosen',
				graphNodeId: 'chosen',
				path: [],
				target: { kind: 'text' },
				symbolId: 'row-text',
			};
		const rowView = {
			version: 1,
			locators: [
				{ hostNodeId: 'parent', strategy: 'dom-order', index: 1, tagName: 'section' },
				{ hostNodeId: 'row-output', strategy: 'dom-order', index: 4, tagName: 'output' },
			],
			events: [],
			domUpdates: [rowUpdate],
			behaviors: [],
			elementHandles: [],
			keyedRepeats: [repeat],
			branches: [],
			asyncBoundaries: [],
		};
		const rowMap = {
			recordKinds: [
				{ kind: 'keyed-repeat', replaced: true },
				{ kind: 'dom-update', replaced: true },
			],
			actions: [
				{
					hostNodeId: 'parent',
					eventName: 'click',
					recordKind: 'keyed-repeat-row',
					plan: {
						version: 1,
						kind: 'row',
						symbolId: 'row',
						cell: 'chosen',
						write: { kind: 'assign', localPath: ['card', 'key'] },
						textUpdates: [
							{
								hostNodeId: 'row-output',
								graphNodeId: 'chosen',
								symbolId: 'row-text',
							},
						],
						repeatId: 'repeat',
						fullDecodeCells: ['cards'],
					},
				},
			],
		};
		await resumeScalarRowEventFromPayloadDocument({
			root: rowRoot,
			document: payloadDocument(rowState, rowView),
			event: { type: 'click', target: rowButton },
			runtimeDemandMap: rowMap,
			loadSymbol: () => () => {},
		} as never);
		expect([rowOutput.textContent, channel()?.containers[0]?.phase]).toEqual([
			'north',
			'ssr-lean',
		]);
		let loaded = false;
		await resumeScalarCoreEventFromPayloadDocument({
			root,
			event: { type: 'focus', target: root },
			document: { querySelector: () => null },
			loadSymbol: () => () => {},
			loadFullResume: async () => void (loaded = true),
		} as never);
		expect([loaded, channel()?.containers[0]?.phase]).toEqual([true, 'ssr-resume']);
	});
});

test('v1 snapshots are exact and immutable; violations are bounded, deep-frozen, and DOM-free', () => {
	const root = element('MAIN');
	__marklessDebugStartContainer(root as never, 'csr');
	for (let index = 0; index < 105; index++)
		__marklessDebugRecordViolation({ code: `DEBUG_${index}`, message: String(index) });
	__marklessDebugRecordViolation({
		code: 'SAFE',
		message: 'safe',
		details: { nested: { values: [1, 'two'] } },
	});
	__marklessDebugRecordViolation({
		code: 'DOM_VALUE',
		message: 'drop',
		details: { root: root as never },
	});
	const debug = channel()!;
	expect(Reflect.ownKeys(debug).sort()).toEqual(
		[
			'containers',
			'droppedViolationCount',
			'explainInteraction',
			'version',
			'violationCapacity',
			'violations',
		].sort(),
	);
	expect(
		(globalThis as Record<PropertyKey, unknown>)[
			Symbol.for('markless.debug.channel.v1.bootstrap')
		],
	).toBeUndefined();
	expect([debug.version, debug.violationCapacity, debug.violations.length]).toEqual([
		1, 100, 100,
	]);
	expect(
		Object.isFrozen(debug.containers) &&
			Object.isFrozen(debug.violations) &&
			Object.isFrozen(debug.violations.at(-3)?.details?.nested),
	).toBe(true);
	expect(debug.violations.at(-2)).not.toHaveProperty('details');
	expect(debug.violations.at(-1)).toMatchObject({ code: 'MARKLESS_DEBUG_DETAILS_DROPPED' });
});

test('a collected direct-CSR root reports disconnected once and is pruned', () => {
	const Original = globalThis.WeakRef;
	let alive = true;
	(globalThis as any).WeakRef = class<T extends object> {
		constructor(private value: T) {}
		deref() {
			return alive ? this.value : undefined;
		}
	};
	try {
		__marklessDebugResetForTest();
		__marklessDebugStartContainer(element('MAIN') as never, 'csr');
		alive = false;
		expect(channel()?.containers[0]?.root.connected).toBe(false);
		expect(channel()?.containers).toEqual([]);
	} finally {
		globalThis.WeakRef = Original;
	}
});

test('boundary snapshots neither demand idle work nor leak post-disposal subscriptions', async () => {
	let runs = 0,
		subscriptions = 0;
	const base = createRuntimeGraph({
		cells: [],
		asyncComputed: [
			{ graphNodeId: 'idle', dependencies: [], key: () => 0, run: () => void runs++ },
		],
	});
	const graph = {
		...base,
		subscribe(input: Parameters<typeof base.subscribe>[0]) {
			subscriptions++;
			const release = base.subscribe(input);
			return () => {
				subscriptions--;
				release();
			};
		},
	};
	const root = element('MAIN'),
		boundary = {
			id: 'idle-boundary',
			startAnchor: {},
			endAnchor: {},
			asyncReads: [{ graphNodeId: 'idle', path: [] }],
		};
	const runtime = createDebugResumeRuntime(
		{
			root,
			graph,
			loadSymbol: () => () => {},
			view: {
				version: 1,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				keyedRepeats: [],
				branches: [],
				asyncBoundaries: [boundary],
			},
		} as never,
		{
			elementsByHostId: new Map(),
			elementHandles: { get: () => undefined, register() {}, deleteHost() {} },
			asyncBoundariesById: new Map([[boundary.id, boundary]]),
		} as never,
	);
	const starting = runtime.start();
	runtime.dispose();
	await starting;
	expect({ runs, subscriptions }).toEqual({ runs: 0, subscriptions: 0 });
});
