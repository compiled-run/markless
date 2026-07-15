import { gzipSync } from 'node:zlib';
import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@markless/serializer';
import { createProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import {
	marklessCsrAttachPropEvent,
	marklessCsrComposeView,
	marklessCsrRenderChild,
} from '../src/fns/csr.ts';
import { render, renderToString } from '../src/index.ts';

type FakeElement = {
	readonly nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: FakeEvent) => Promise<void>;
		readonly options?: { readonly capture?: boolean } | boolean;
	}>;
	textContent?: string;
	parentElement?: FakeElement | null;
	querySelector?: (selector: string) => { readonly textContent?: string | null } | null;
	addEventListener(
		type: string,
		listener: (event: FakeEvent) => Promise<void>,
		options?: { readonly capture?: boolean } | boolean,
	): void;
};

type FakeEvent = {
	readonly type: string;
	readonly target: FakeElement;
	readonly key?: string;
	defaultPrevented?: boolean;
	propagationStopped?: boolean;
	preventDefault?: () => void;
	stopPropagation?: () => void;
};

type FakeFragment = {
	readonly nodeType: 11;
	readonly childNodes: FakeElement[];
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = {
		nodeType: 1,
		tagName,
		childNodes,
		listeners: [],
		addEventListener(type, listener, options) {
			this.listeners.push({ type, listener, options });
		},
	};
	(node as unknown as { removeChild(child: unknown): unknown }).removeChild = (
		child: unknown,
	) => {
		const index = node.childNodes.indexOf(child as FakeElement);
		if (index >= 0) node.childNodes.splice(index, 1);
		(child as { parentNode?: unknown }).parentNode = null;
		return child;
	};
	(node as unknown as { insertBefore(child: unknown, before: unknown): unknown }).insertBefore = (
		child: unknown,
		before: unknown,
	) => {
		const index = before ? node.childNodes.indexOf(before as FakeElement) : -1;
		(child as { parentNode?: unknown }).parentNode = node;
		node.childNodes.splice(
			index >= 0 ? index : node.childNodes.length,
			0,
			child as FakeElement,
		);
		return child;
	};
	for (const child of childNodes) {
		child.parentElement = node;
		(child as unknown as { parentNode?: unknown }).parentNode = node;
	}
	return node;
}

function event(type: string, target: FakeElement): FakeEvent {
	return { type, target };
}

function viewWithClick(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function viewWithClickDomUpdate(): ProtocolViewPayload {
	return {
		...viewWithClick(),
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
	};
}

function viewWithClickSyncComputedDomUpdate(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [
			{
				hostNodeId: 'h0',
				source: 'doubled',
				graphNodeId: 'computed:doubled',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function viewWithSyncPolicy(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [
			{
				hostNodeId: 'h0',
				eventName: 'keydown',
				syncPolicy: {
					when: { type: 'event-equals', field: 'key', value: 'Escape' },
					actions: ['preventDefault', 'stopPropagation'],
				},
				symbolIds: ['symbol:key'],
			},
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function viewWithElementHandle(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [{ hostNodeId: 'h0', handleId: 'handle:counter', name: 'counter' }],
		asyncBoundaries: [],
	};
}

function viewWithAsyncBoundary(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'p' }],
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
						path: ['title'],
						runnerSymbolId: 'symbol:details-runner',
					},
				],
			},
		],
	};
}

function staticView(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function duplicateKeyRepeatView(): ProtocolViewPayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'ul' }],
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
				keyPath: ['category'],
				itemName: 'row',
				rowElementCount: 1,
				rowEvents: [],
			},
		],
	};
}

const duplicateRows = [
	{ category: 'fruit', label: 'apple' },
	{ category: 'fruit', label: 'pear' },
	{ category: 'veg', label: 'kale' },
];

function duplicateRowsState() {
	return createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:rows', name: 'rows', valueKind: 'array', value: duplicateRows },
		],
	});
}

test('render creates a CSR container without payload scripts or the inline resumer', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const loadedSymbols: string[] = [];
	let componentBodyRuns = 0;

	const container = await render(
		() => {
			componentBodyRuns++;
			const button = element('BUTTON');
			button.textContent = 'Count 0';
			return {
				root: button,
				state,
				view: viewWithClick(),
				loadSymbol(symbolId: string) {
					loadedSymbols.push(symbolId);
					return ({ graph }) => {
						graph.write({ graphNodeId: 'state:count', value: 1 });
					};
				},
			};
		},
		{ target },
	);

	expect(componentBodyRuns).toBe(1);
	expect(target.children).toEqual([container.root]);
	expect(container.phase).toBe('csr');
	expect(container.payloadScripts).toBeUndefined();
	expect(container.resumerScript).toBeUndefined();
	expect(loadedSymbols).toEqual([]);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(container.graph.read('state:count')).toBe(1);
});

test('render rejects duplicate runtime keys before mounting CSR output', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};

	await expect(
		render(
			() => ({
				root: element(
					'UL',
					duplicateRows.map(() => element('LI')),
				),
				state: duplicateRowsState(),
				view: duplicateKeyRepeatView(),
				loadSymbol: () => () => undefined,
			}),
			{ target },
		),
	).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from row.category.',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
		keyPath: ['category'],
		collidingValue: 'fruit',
	});
	expect(target.children).toEqual([]);
});

test('render adopts the mount target as container root for fragment-rooted components', async () => {
	const header = element('HEADER');
	const button = element('BUTTON');
	button.textContent = 'Count 0';
	const target = element('DIV') as FakeElement & {
		replaceChildren(...children: Array<FakeElement | FakeFragment>): void;
	};
	target.replaceChildren = (...children) => {
		// Real DOM expands document fragments on insertion.
		target.childNodes.length = 0;
		for (const child of children) {
			if (child.nodeType === 11) {
				for (const fragmentChild of child.childNodes) {
					fragmentChild.parentElement = target;
					target.childNodes.push(fragmentChild);
				}
				child.childNodes.length = 0;
				continue;
			}
			child.parentElement = target;
			target.childNodes.push(child);
		}
	};
	const fragment: FakeFragment = { nodeType: 11, childNodes: [header, button] };
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		// Fragment-relative locators: the compiled CSR module indexes the
		// fragment children 0..n with no root element in the walk.
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'header' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
		],
		events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const loadedSymbols: string[] = [];

	const container = await render(
		() => ({
			root: fragment as unknown as Parameters<typeof render>[0] extends never
				? never
				: FakeElement,
			state,
			view,
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				return ({ graph }: { graph: { write(input: unknown): void } }) => {
					graph.write({ graphNodeId: 'state:count', value: 1 });
				};
			},
		}),
		{ target },
	);

	// Ratified D3 semantics: the mount target is the container root.
	expect(container.root).toBe(target);
	expect(target.childNodes.map((child) => child.tagName)).toEqual(['HEADER', 'BUTTON']);
	// Delegation lives on the target, and fragment-relative locators were
	// offset +1 so the second sibling still resolves after adoption.
	await target.listeners
		.find((entry) => entry.type === 'click')!
		.listener(event('click', button));
	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(container.graph.read('state:count')).toBe(1);
});

test('render flips CSR branch ranges through the full resume runtime', async () => {
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:branch:branch-site:0',
	} as unknown as FakeElement;
	const shown = element('P');
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:branch:branch-site:0',
	} as unknown as FakeElement;
	const root = element('MAIN', [startAnchor, shown, endAnchor]);
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:open', name: 'open', valueKind: 'scalar', value: true }],
	});
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
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
	};
	const loadedSymbols: string[] = [];
	const replacement = element('SPAN');

	const container = await render(
		() => ({
			root,
			state,
			view,
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				return () => ({ arm: 1, html: '<span>Hidden</span>' });
			},
		}),
		{
			target,
			renderBranchHtml: () => [replacement as never],
		},
	);

	// Branch-bearing views must take the full resume runtime, and the arm
	// seeds from graph reads with no symbol load at startup.
	expect(loadedSymbols).toEqual([]);

	container.graph.write({ graphNodeId: 'state:open', value: false });
	await container.graph.flush?.();

	expect(loadedSymbols).toEqual(['symbol:flip']);
	expect(
		root.childNodes.map((child) => (child.nodeType === 8 ? '#comment' : child.tagName)),
	).toEqual(['#comment', 'SPAN', '#comment']);
});

test('render flips a composed child CSR branch from a callback-prop dispatch', async () => {
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:branch:branch-site:icon',
	} as unknown as FakeElement;
	const playIcon = element('SPAN');
	playIcon.textContent = '▶';
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:branch:branch-site:icon',
	} as unknown as FakeElement;
	const button = element('BUTTON', [startAnchor, playIcon, endAnchor]);
	const root = element('MAIN', [button]);
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:playing', name: 'playing', valueKind: 'scalar', value: false },
		],
	});
	const parentView: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const childView: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [
			{ hostNodeId: 'play-button', strategy: 'dom-order', index: 0, tagName: 'button' },
		],
		events: [
			{ hostNodeId: 'play-button', eventName: 'click', symbolIds: ['symbol:child-noop'] },
		],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
		branches: [
			{
				id: 'branch-site:icon',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				symbolId: 'symbol:icon-branch',
				testReads: [{ source: 'active', graphNodeId: 'prop:active', path: [] }],
			},
		],
	};
	let runtimeGraph: { write(input: unknown): void } | undefined;
	const childOutput = marklessCsrRenderChild(
		{
			renderCsr(props?: { readonly onPlayToggle?: (event: FakeEvent) => void }) {
				marklessCsrAttachPropEvent(button, [], 'click', props?.onPlayToggle);
				return {
					root: button,
					view: childView,
					propEvents: [
						{
							hostNodeId: 'play-button',
							eventName: 'click',
							propName: 'onPlayToggle',
						},
					],
				};
			},
		},
		{
			onPlayToggle() {
				if (!runtimeGraph) throw new Error('Expected CSR runtime graph to be connected.');
				runtimeGraph.write({ graphNodeId: 'state:playing', value: true });
			},
		},
	);
	const view = marklessCsrComposeView(
		root,
		parentView,
		[],
		[
			{
				output: childOutput,
				hostPrefix: 'c0:',
				symbolPrefix: 'c0:',
				graphProps: [{ name: 'active', graphNodeId: 'state:playing', path: [] }],
			},
		],
	) as ProtocolViewPayload;
	const pauseIcon = element('SPAN');
	pauseIcon.textContent = '❚❚';
	const loadedSymbols: string[] = [];

	const container = await render(
		() => ({
			root,
			state,
			view,
			connectRuntime(context) {
				runtimeGraph = context.graph as { write(input: unknown): void };
			},
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'c0:symbol:child-noop') return () => undefined;
				return (context: {
					readonly branchId?: string;
					readonly composedBranchId?: string;
				}) => {
					expect(context).toMatchObject({
						branchId: 'branch-site:icon',
						composedBranchId: 'c0:branch-site:icon',
					});
					return {
						arm: 0,
						html: context.branchId === 'branch-site:icon' ? '<span>❚❚</span>' : '',
					};
				};
			},
		}),
		{
			target,
			renderBranchHtml: (html) => (html ? [pauseIcon as never] : []),
		},
	);

	const click = event('click', button);
	await container.root.listeners[0]!.listener(click);

	expect(button.listeners).toHaveLength(1);
	await button.listeners[0]!.listener(click);
	expect(container.graph.read('state:playing')).toBe(true);
	expect(loadedSymbols).toEqual(['c0:symbol:icon-branch']);
	expect(button.childNodes.map((child) => child.textContent)).toEqual([
		'markless:branch:c0:branch-site:icon',
		'❚❚',
		'/markless:branch:c0:branch-site:icon',
	]);
});

test('render flips the seventh composed child CSR branch independently', async () => {
	const buttons = Array.from({ length: 6 }, () => element('BUTTON'));
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:branch:branch-site:0',
	} as unknown as FakeElement;
	const shown = element('SPAN');
	shown.textContent = '▶';
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:branch:branch-site:0',
	} as unknown as FakeElement;
	buttons.push(element('BUTTON', [startAnchor, shown, endAnchor]));
	const root = element('MAIN', buttons);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:open', name: 'open', valueKind: 'scalar', value: false }],
	});
	const childView: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [{ hostNodeId: 'button', strategy: 'dom-order', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'button', eventName: 'click', symbolIds: ['symbol:toggle'] }],
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
			},
		],
	};
	const pause = element('SPAN');
	pause.textContent = '❚❚';
	(pause as FakeElement & { outerHTML: string }).outerHTML = '<span class="play-icon">❚❚</span>';
	const armMarkupRecords = [[{ text: '<span class=play-icon>❚❚</span>' }], [{ text: '▶' }]];
	const loadedSymbols: string[] = [];
	const renderedBranchHtml: string[] = [];
	const childLoadSymbol = (index: number) => (symbolId: string) => {
		loadedSymbols.push(`c${index}:${symbolId}`);
		if (index === 6 && symbolId === 'symbol:toggle')
			return ({ graph }) => graph.write({ graphNodeId: 'state:open', value: true });
		return (context: {
			readonly arm?: number;
			readonly branchId?: string;
			readonly composedBranchId?: string;
		}) => {
			if (
				index !== 6 ||
				context.branchId !== 'branch-site:0' ||
				context.composedBranchId !== 'c6:branch-site:0'
			)
				return { arm: context.arm ?? 0, html: '' };
			const arm = context.arm ?? 0;
			return { arm, html: armMarkupRecords[arm] as never };
		};
	};
	const view = marklessCsrComposeView(
		root,
		{
			version: ASYNC_PROTOCOL_VERSION,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		[],
		buttons.map((button, index) => ({
			output: {
				root: button,
				view: index === 6 ? childView : { ...childView, branches: [] },
				loadSymbol: childLoadSymbol(index),
			},
			hostPrefix: `c${index}:`,
			symbolPrefix: `c${index}:`,
			graphProps: [],
		})),
	) as ProtocolViewPayload;

	const global = globalThis as { document?: unknown };
	const previousDocument = global.document;
	expect(buttons[6]!.childNodes.map((child) => child.textContent)).toEqual([
		'markless:branch:c6:branch-site:0',
		'▶',
		'/markless:branch:c6:branch-site:0',
	]);
	global.document = {
		createElement(tagName: string) {
			if (tagName !== 'template') throw new Error(`Unexpected tag ${tagName}`);
			let childNodes: FakeElement[] = [];
			return {
				content: {
					get childNodes() {
						return childNodes;
					},
				},
				set innerHTML(value: unknown) {
					const html = String(value);
					renderedBranchHtml.push(html);
					childNodes =
						html === '<span class=play-icon>❚❚</span>'
							? [pause]
							: [{ nodeType: 3, textContent: html } as unknown as FakeElement];
				},
			};
		},
	};
	const container = await (async () => {
		try {
			return await render(
				() => ({
					root,
					state,
					view,
					loadSymbol(symbolId: string) {
						const index = buttons.findIndex((_, childIndex) =>
							symbolId.startsWith(`c${childIndex}:`),
						);
						if (index >= 0)
							return childLoadSymbol(index)(symbolId.slice(`c${index}:`.length));
						throw new Error(`Unexpected parent symbol ${symbolId}`);
					},
				}),
				{ target: { replaceChildren() {} } },
			);
		} finally {
			global.document = previousDocument;
		}
	})();

	await container.root.listeners[0]!.listener(event('click', buttons[6]!));

	expect(loadedSymbols).toEqual(['c6:symbol:toggle', 'c6:symbol:branch']);
	expect(renderedBranchHtml).toEqual(['<span class=play-icon>❚❚</span>']);
	const branchText = buttons[6]!.childNodes.map((child) => child.textContent);
	expect(branchText).toEqual([
		'markless:branch:c6:branch-site:0',
		'❚❚',
		'/markless:branch:c6:branch-site:0',
	]);
	expect(branchText).not.toContain('▶');
	expect(buttons[6]!.childNodes[1]).toMatchObject({
		tagName: 'SPAN',
		outerHTML: '<span class="play-icon">❚❚</span>',
	});
});

test('render dispatch throws a tagged error when no event record matches', async () => {
	const button = element('BUTTON');
	const outside = element('BUTTON');
	const container = await render(
		() => ({
			root: button,
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
			loadSymbol: () => () => undefined,
		}),
		{ target: { replaceChildren() {} } },
	);

	await expect(container.runtime.dispatch(event('click', outside))).rejects.toMatchObject({
		code: 'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		phase: 'event',
		eventName: 'click',
	});
});

test('render starts artifact-owned CSR preload work without requiring app code', async () => {
	const root = element('MAIN');
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const preloads: string[] = [];

	await render(
		{
			preload() {
				preloads.push('started');
			},
			renderCsr() {
				return { root };
			},
		},
		{ target },
	);

	expect(preloads).toEqual(['started']);
	expect(target.children).toEqual([root]);
});

test('render activates CSR behavior symbols after creating host elements', async () => {
	const root = element('BUTTON');
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const loadedSymbols: string[] = [];
	const installed: string[] = [];

	await render(
		{
			renderCsr() {
				return {
					root,
					state,
					view: {
						...viewWithClickDomUpdate(),
						behaviors: [
							{
								hostNodeId: 'h0',
								source: 'chart',
								functionSource: 'chart',
								inputSources: [],
								symbolId: 'symbol:chart',
							},
						],
						elementHandles: [],
						asyncBoundaries: [],
					},
					loadSymbol(symbolId: string) {
						loadedSymbols.push(symbolId);
						if (symbolId === 'symbol:click') {
							return ({ graph }) => {
								graph.write({ graphNodeId: 'state:count', value: 1 });
							};
						}
						if (symbolId === 'symbol:text') {
							return (context) => ({
								type: 'setText',
								locator: context.domUpdate?.hostNodeId ?? 'h0',
								value: context.value,
							});
						}
						return ({ element: host }) => {
							installed.push(host.tagName);
						};
					},
				};
			},
		},
		{ target },
	);

	expect(loadedSymbols).toEqual(['symbol:chart']);
	expect(installed).toEqual(['BUTTON']);
	expect(target.children).toEqual([root]);

	await root.listeners[0].listener(event('click', root));

	expect(loadedSymbols).toEqual(['symbol:chart', 'symbol:click', 'symbol:text']);
	expect(root.textContent).toBe('1');
});

test('render connects the CSR runtime before mounting visible DOM', async () => {
	const order: string[] = [];
	let connected = false;
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			order.push(`mount:${connected}`);
			this.children = children;
		},
	};
	const root = element('BUTTON');

	await render(
		() => ({
			root,
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
			loadSymbol() {
				return () => {};
			},
			connectRuntime() {
				connected = true;
				order.push('connect');
			},
		}),
		{ target },
	);

	expect(order).toEqual(['connect', 'mount:true']);
	expect(target.children).toEqual([root]);
});

test('render returns a compiler-provided CSR runtime without event resume startup', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const root = element('DIV');
	const graph = {
		read() {
			return 'ready';
		},
	};
	const runtime = {
		graph,
		view: staticView(),
		async dispatch() {},
	};

	const container = await render(
		() => ({
			root,
			graph,
			runtime,
		}),
		{
			target,
			get loadSymbol() {
				throw new Error('fast-path render must not read fallback loadSymbol');
			},
		},
	);

	expect(target.children).toEqual([root]);
	expect(container.graph).toBe(graph);
	expect(container.runtime).toBe(runtime);
});

test('render uses the narrow CSR event path to apply DOM update symbols', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const loadedSymbols: string[] = [];
	const button = element('BUTTON');
	button.textContent = '0';

	const container = await render(
		() => ({
			root: button,
			state,
			view: viewWithClickDomUpdate(),
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:click') {
					return ({ graph }) => {
						graph.update({
							graphNodeId: 'state:count',
							path: [],
							returnValue: 'next',
							update(value) {
								return Number(value) + 1;
							},
						});
					};
				}
				return (context) => ({
					type: 'setText',
					locator: context.domUpdate?.hostNodeId ?? 'h0',
					value: context.value,
				});
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click', 'symbol:text']);
	expect(container.graph.read('state:count')).toBe(1);
	expect(button.textContent).toBe('1');
});

test('render wires CSR sync computed dependencies through the full runtime', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const button = element('BUTTON');
	button.textContent = '4';
	const state = {
		...createProtocolStatePayload({
			cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 2 }],
		}),
		computed: [
			{
				graphNodeId: 'computed:doubled',
				name: 'doubled',
				async: false,
				deriveSymbolId: 'symbol:derive',
				dependencies: [{ graphNodeId: 'state:count', path: [] }],
			},
		],
	};
	const loadedSymbols: string[] = [];

	const container = await render(
		() => ({
			root: button,
			state: state as never,
			view: viewWithClickSyncComputedDomUpdate(),
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:click') {
					return ({ graph }) =>
						graph.update({
							graphNodeId: 'state:count',
							path: [],
							returnValue: 'next',
							update: (value) => Number(value) + 1,
						});
				}
				if (symbolId === 'symbol:derive') {
					return ({ graph }) => Number(graph.read('state:count')) * 2;
				}
				return (context) => ({
					type: 'setText',
					locator: context.domUpdate?.hostNodeId ?? 'h0',
					value: context.value,
				});
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click', 'symbol:derive', 'symbol:text']);
	expect(container.graph.read('computed:doubled')).toBe(6);
	expect(button.textContent).toBe('6');
});

test('render falls back from the event-only path when element handles are present', async () => {
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const button = element('BUTTON');
	const state = createProtocolStatePayload({ cells: [] });
	let resolvedHandle: FakeElement | undefined;

	const container = await render(
		() => ({
			root: button,
			state,
			view: viewWithElementHandle(),
			loadSymbol() {
				return ({ getElementHandle }) => {
					resolvedHandle = getElementHandle('counter') as FakeElement | undefined;
				};
			},
		}),
		{ target },
	);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(resolvedHandle).toBe(button);
});

test('renderToString emits an SSR container and omits the resumer for static output', async () => {
	let componentBodyRuns = 0;
	const html = await renderToString(() => {
		componentBodyRuns++;
		return {
			html: '<main><p>Static news</p></main>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:article',
						name: 'article',
						valueKind: 'object',
						value: { title: 'Static news' },
					},
				],
			}),
			view: {
				...staticView(),
				locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
				domUpdates: [
					{
						hostNodeId: 'h0',
						source: 'article',
						graphNodeId: 'state:article',
						path: ['title'],
						target: { kind: 'text' },
						symbolId: 'symbol:static-text',
					},
				],
			},
		};
	});

	expect(componentBodyRuns).toBe(1);
	expect(html).toBe('<div data-async-container><main><p>Static news</p></main></div>');
	expect(html).not.toContain('type="markless/state"');
	expect(html).not.toContain('type="markless/view"');
	expect(html).not.toContain('data-async-resumer');
});

test.each([
	{
		name: 'an element event',
		state: createProtocolStatePayload({ cells: [] }),
		view: viewWithClick(),
	},
	{
		name: 'a keyed-row event',
		state: createProtocolStatePayload({ cells: [] }),
		view: {
			...duplicateKeyRepeatView(),
			keyedRepeats: duplicateKeyRepeatView().keyedRepeats?.map((repeat) => ({
				...repeat,
				rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row-click'] }],
			})),
		},
	},
	{
		name: 'a sync computed derive symbol',
		state: {
			...createProtocolStatePayload({ cells: [] }),
			computed: [
				{
					graphNodeId: 'computed:greeting',
					name: 'greeting',
					async: false,
					deriveSymbolId: 'symbol:derive-greeting',
					dependencies: [],
				},
			],
		},
		view: staticView(),
	},
	{
		name: 'an async boundary',
		state: createProtocolStatePayload({ cells: [] }),
		view: viewWithAsyncBoundary(),
	},
])('renderToString keeps payload scripts and the resumer for $name', async ({ state, view }) => {
	const html = await renderToString(
		() => ({ html: '<button type="button">Resume</button>', state, view }),
		{ resumeModuleUrl: '/async-resume.js' },
	);

	expect(html).toContain('type="markless/state"');
	expect(html).toContain('type="markless/view"');
	expect(html).toContain('data-async-resumer');
});

// Live directValue cells (page props seeded by the host, need 14) must be
// envelope-encoded before the payload script is served — resume validation
// rejects a leaked directValue on first interaction.
test('renderToString envelope-encodes live directValue state cells before serving', async () => {
	const html = await renderToString(() => ({
		html: '<button>Go</button>',
		state: {
			version: ASYNC_PROTOCOL_VERSION,
			cells: [
				{
					graphNodeId: 'prop:props',
					name: 'props',
					valueKind: 'object' as const,
					directValue: { params: { owner: 'ada' }, status: 200 },
				},
			],
			computed: [],
		},
		view: viewWithClick(),
	}));

	expect(html).toContain('"graphNodeId":"prop:props"');
	expect(html).not.toContain('directValue');
	expect(html).toContain('"records"');
});

test('renderToString rejects duplicate runtime keys on the static output path', async () => {
	await expect(
		renderToString(() => ({
			html: '<ul><li>apple</li><li>pear</li><li>kale</li></ul>',
			state: duplicateRowsState(),
			view: duplicateKeyRepeatView(),
		})),
	).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		message: 'MARKLESS_REPEAT_KEY_DUPLICATE: Duplicate @for key "fruit" from row.category.',
		phase: 'runtime',
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_KEY_DUPLICATE',
		keyPath: ['category'],
		collidingValue: 'fruit',
	});
});

test('renderToString keeps fragment sibling roots as direct container children and offsets their locators', async () => {
	const html = await renderToString({
		renderSsr: () => ({
			html: '<header>Site</header><button type="button">0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'header' },
					{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				],
				events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] }],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
			},
		}),
	});

	// Fragment-rooted SSR html is concatenated sibling roots. The container must
	// keep both siblings as its direct children with no extra wrapper element,
	// so container-scoped locator indexes stay aligned to the element walk.
	expect(html).toContain(
		'<div data-async-container><header>Site</header><button type="button">0</button>',
	);

	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;

	// The container div is walk-element 0, so both flat dom-order sibling
	// locators are offset by +1 (0 -> 1 and 1 -> 2).
	expect(view.locators).toEqual([
		{ hostNodeId: 'h0', strategy: 'dom-order', index: 1, tagName: 'header' },
		{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
	]);
	expect(view.events).toEqual([
		{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:click'] },
	]);
});

test('renderToString keeps async boundary anchors as the only comments in document order', async () => {
	const html = await renderToString(
		() => ({
			html: '<!--markless:async:boundary:0--><p>Pending</p><!--/markless:async:boundary:0-->',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithAsyncBoundary(),
		}),
		{
			nonce: 'nonce-1',
			resumerSource: 'globalThis.__started = true;',
		},
	);

	expect(html).toContain('data-async-container');
	expect(html).toContain('<script type="markless/state">');
	expect(html).toContain('<script type="markless/view">');
	expect(html).toContain('dom-order-comment');

	// Container wrapping, payload scripts, and the inline resumer must not add
	// comment nodes: flat comment-anchor indexes stay aligned only if the two
	// compiler-emitted anchors are the only comments in the container.
	expect(html.match(/<!--/g)).toHaveLength(2);

	const startIndex = html.indexOf('<!--markless:async:boundary:0-->');
	const endIndex = html.indexOf('<!--/markless:async:boundary:0-->');
	expect(startIndex).toBeGreaterThanOrEqual(0);
	expect(endIndex).toBeGreaterThan(startIndex);
	expect(startIndex).toBeLessThan(html.indexOf('<p>Pending</p>'));
	expect(html.indexOf('<p>Pending</p>')).toBeLessThan(endIndex);
	expect(endIndex).toBeLessThan(html.indexOf('<script type="markless/state">'));
});

test('renderToString emits one inline resumer for SSR containers with browser triggers', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{
			nonce: 'nonce-1',
			resumerSource: 'globalThis.__started = (globalThis.__started ?? 0) + 1;',
		},
	);

	expect(html.match(/data-async-resumer/g)).toHaveLength(1);
	expect(html).toContain('<script type="markless/state">');
	expect(html).toContain('<script type="markless/view">');
	expect(html.indexOf('<script type="markless/view">')).toBeLessThan(
		html.indexOf('data-async-resumer'),
	);
	expect(html).toContain('<script data-async-resumer nonce="nonce-1">');
	expect(html).toContain('globalThis.__started');
});

test('renderToString wakes the runtime for arm-record event types', async () => {
	const html = await renderToString(
		() => ({
			html: '<main><!--markless:branch:branch-site:0--><section><button>Go</button></section><!--/markless:branch:branch-site:0--></main>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
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
						armRecords: [
							{
								events: [
									{
										hostPath: [0, 0],
										eventName: 'click',
										symbolIds: ['symbol:go'],
									},
								],
								domUpdates: [],
								behaviors: [],
								elementHandles: [],
							},
						],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	// A click on an arm host may be the page's FIRST interaction: the inline
	// resumer must include arm-record event types in its wake set and forward
	// unmatched events so the full runtime resolves the arm match.
	expect(html).toContain('data-async-resumer');
	expect(html).toContain('armRecords');
	expect(html).toContain('eventRecord: null');
});

test('renderToString serializes runtime-attached async snapshots into valid payloads', async () => {
	const html = await renderToString(
		() => ({
			html: '<p>Hello Ada</p>',
			state: {
				...createProtocolStatePayload({ cells: [] }),
				computed: [
					{
						graphNodeId: 'computed:details',
						name: 'details',
						async: true,
						// Runtime-attached snapshot: raw values, not envelopes.
						snapshot: {
							status: 'fulfilled',
							version: 1,
							key: null,
							value: { title: 'Hello Ada' },
						},
					},
				],
			} as never,
			view: viewWithClick(),
			resumeModuleUrl: '/app.js',
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	const stateJson = /<script type="markless\/state">(.*?)<\/script>/.exec(html)?.[1];
	expect(stateJson).toBeDefined();
	// The served payload must decode: raw snapshot key/value are serialized
	// into graph envelopes (the browser threw MARKLESS_PAYLOAD_INVALID on
	// first interaction otherwise — caught by the browser matrix).
	const { assertProtocolStatePayload } =
		await import('../../serializer/src/protocol-validation.ts');
	expect(() => assertProtocolStatePayload(JSON.parse(stateJson!))).not.toThrow();
});

test('renderToString emits the resumer for keyed-repeat row events', async () => {
	const html = await renderToString(
		() => ({
			html: '<section><article><h2>Alpha</h2><button>Choose</button></article></section>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [],
				events: [],
				domUpdates: [],
				behaviors: [],
				elementHandles: [],
				asyncBoundaries: [],
				keyedRepeats: [
					{
						id: 'repeat:0',
						parentHostNodeId: 'h1',
						collectionGraphNodeId: 'state:entries',
						collectionPath: [],
						keyPath: ['code'],
						itemName: 'entry',
						rowElementCount: 3,
						rowEvents: [{ hostPath: [1], eventName: 'click', symbolIds: ['symbol:0'] }],
					},
				],
			},
		}),
		{ resumeModuleUrl: '/app.js' },
	);

	// Row events are browser triggers: keyed-only pages must bootstrap the
	// resumer, and the inline delegation must forward unmatched clicks of row
	// event types so the full runtime can resolve the row.
	expect(html).toContain('data-async-resumer');
	// The inline source collects row event types from the payload and forwards
	// unmatched events of those types without a record.
	expect(html).toContain('keyedRepeats ?? []');
	expect(html).toContain('eventRecord: null');
});

test('renderToString emits ordered modulepreload links before interactive payload startup', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{
			nonce: 'nonce-1',
			modulePreloads: [
				{ href: '/build/shared.js', fetchPriority: 'high' },
				'/build/symbol.js',
				'/build/shared.js',
				{ href: '/build/low.js', fetchPriority: 'low' },
			],
			resumerSource: 'globalThis.__started = true;',
		},
	);

	expect(html.match(/rel="modulepreload"/g)).toHaveLength(3);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/shared.js" crossorigin="anonymous" fetchpriority="high" nonce="nonce-1">',
	);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/symbol.js" crossorigin="anonymous" nonce="nonce-1">',
	);
	expect(html).toContain(
		'<link rel="modulepreload" href="/build/low.js" crossorigin="anonymous" fetchpriority="low" nonce="nonce-1">',
	);
	expect(html.indexOf('rel="modulepreload"')).toBeLessThan(html.indexOf('<button'));
	expect(html.indexOf('rel="modulepreload"')).toBeLessThan(html.indexOf('data-async-resumer'));
});

test('renderToString uses compiled artifact modulepreloads by default', async () => {
	const html = await renderToString({
		modulePreloads: [{ href: '/src/App.tsrx?import', fetchPriority: 'high' }],
		resumeModuleUrl: '/src/App.tsrx?import',
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(html).toContain(
		'<link rel="modulepreload" href="/src/App.tsrx?import" crossorigin="anonymous" fetchpriority="high">',
	);
});

test('renderToString emits compiled artifact head injections before the container', async () => {
	const html = await renderToString({
		headInjections: [
			{
				tag: 'script',
				location: 'head',
				attributes: { type: 'module', src: '/@vite/client' },
			},
		],
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(html).toContain('<script type="module" src="/@vite/client"></script>');
	expect(html.indexOf('/@vite/client')).toBeLessThan(html.indexOf('<div'));
});

test('renderToString uses the compiled artifact resume module URL by default', async () => {
	const resumeModuleUrl = createResumeModuleUrl('artifact-default');
	const html = await renderToString({
		resumeModuleUrl,
		renderSsr: () => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
	});

	expect(extractResumerSource(html)).toContain(JSON.stringify(resumeModuleUrl));
});

test('renderToString inline event resumer imports the resume module only after interaction', async () => {
	const resumeModuleUrl = createResumeModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	expect(resumerSource).not.toContain('preventDefault');
	expect(resumerSource).not.toContain('stopPropagation');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		expect(listeners).toHaveLength(1);
		expect(globalScope.__asyncResumerTest).toEqual({ imports: 0, events: [] });

		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV'],
		});

		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV', 'click:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString execution log activation stays inline and mirrors summary without imports', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'always', resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).not.toContain('startMarklessExecutionLog');
	expect(resumerSource).not.toContain('preloadedModuleCount');
	expect(resumerSource).toContain('globalThis.__mxLog = globalThis.__mxLog || new Set()');
	expect(resumerSource).toContain('console.log(summary)');
	expect(resumerSource).toContain("setAttribute('data-markless-log-summary', summary)");
	expect(resumerSource).toContain("setAttribute('data-markless-log-app-bytes', '0')");
	expect(resumerSource).toContain("setAttribute('data-markless-log-instrument-bytes', '0')");
	expect(resumerSource).toContain("removeAttribute('data-markless-log-app-bytes')");
});

test('renderToString defaults to auto execution log bootstrap for interactive SSR', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).toContain('localhost|127\\.0\\.0\\.1|\\[::1\\]');
	expect(resumerSource).toContain("new URLSearchParams(l.search).has('markless-log')");
	expect(resumerSource).toContain("localStorage.getItem('marklessLog') === '1'");
	expect(resumerSource).toContain('globalThis.__mxLog = globalThis.__mxLog || new Set()');
	expect(resumerSource).toContain("querySelectorAll('link[rel=modulepreload]')");
	expect(resumerSource).not.toContain('rel="modulepreload"');
});

test('renderToString strips execution log bootstrap when executionLog is never', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl: '/resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).not.toContain('__mxLog');
	expect(resumerSource).not.toContain('markless-log');
	expect(resumerSource).not.toContain('marklessLog');
	expect(resumerSource).not.toContain('data-markless-log-summary');
	expect(resumerSource).not.toContain('querySelectorAll');
});

test('renderToString inline event resumer steps aside after runtime startup', async () => {
	const resumeModuleUrl = createResumeRuntimeStartedModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0](event('click', button));
		await listeners[0](event('click', button));

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['click:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString event-only inline resumer omits sync-policy feature code', async () => {
	const html = await renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl: '/async-resume.js' },
	);
	const resumerSource = extractResumerSource(html);

	expect(resumerSource).not.toContain('preventDefault');
	expect(resumerSource).not.toContain('stopPropagation');
	expect(resumerSource).not.toContain('constant-truthy');
	expect(resumerSource).not.toContain('event-equals');
});

test('renderToString inline event resumer runs sync policy before importing resume module', async () => {
	const resumeModuleUrl = createResumeModuleUrl('sync-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Close</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithSyncPolicy(),
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'keydown' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerTest?: {
			imports: number;
			events: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerTest;
	globalScope.document = document;
	globalScope.__asyncResumerTest = { imports: 0, events: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		expect(listeners).toHaveLength(1);

		const keydown: FakeEvent = {
			type: 'keydown',
			target: button,
			key: 'Escape',
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				this.defaultPrevented = true;
			},
			stopPropagation() {
				this.propagationStopped = true;
			},
		};
		const dispatched = listeners[0](keydown);

		expect(keydown.defaultPrevented).toBe(true);
		expect(keydown.propagationStopped).toBe(true);
		expect(globalScope.__asyncResumerTest).toEqual({ imports: 0, events: [] });

		await dispatched;

		expect(globalScope.__asyncResumerTest).toEqual({
			imports: 1,
			events: ['keydown:DIV'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerTest;
		} else {
			globalScope.__asyncResumerTest = previousTestState;
		}
	}
});

test('renderToString inline event resumer evaluates sync policy before importing symbols', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl();
	const html = await renderToString(
		() => ({
			html: '<button type="button">Save</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'and',
								conditions: [
									{ type: 'constant-truthy', value: true },
									{ type: 'event-equals', field: 'key', value: 'Enter' },
								],
							},
							actions: ['preventDefault', 'stopPropagation'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="markless/view"]' ? { textContent: JSON.stringify(view) } : null;
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			key: 'Enter',
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'stopPropagation', 'import', 'handler:true:true:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

test('renderToString inline event resumer reads graph-backed sync policy before importing symbols', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl('graph-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Close</button>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:menu',
						name: 'menu',
						valueKind: 'object',
						value: { open: true },
					},
				],
			}),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'graph-truthy',
								graphNodeId: 'state:menu',
								path: ['open'],
							},
							actions: ['preventDefault'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const state = extractScriptText(html, 'markless/state');
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	expect(resumerSource).toContain('__marklessEventOnlyGraph');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="markless/state"]') return { textContent: state };
		if (selector === 'script[type="markless/view"]')
			return { textContent: JSON.stringify(view) };
		return null;
	};
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'import', 'handler:true:false:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

test('renderToString emits graph sync-policy inline runtime once for repeated payloads', async () => {
	const inlineRuntimeRegistry = new Set<string>();
	const renderContainer = () =>
		renderToString(
			() => ({
				html: '<button type="button">Close</button>',
				state: createProtocolStatePayload({
					cells: [
						{
							graphNodeId: 'state:menu',
							name: 'menu',
							valueKind: 'object',
							value: { open: true },
						},
					],
				}),
				view: {
					...viewWithClick(),
					events: [
						{
							hostNodeId: 'h0',
							eventName: 'click',
							syncPolicy: {
								when: {
									type: 'graph-truthy',
									graphNodeId: 'state:menu',
									path: ['open'],
								},
								actions: ['preventDefault'],
							},
							symbolIds: ['symbol:click'],
						},
					],
				},
			}),
			{ executionLog: 'never', resumeModuleUrl: '/async-resume.js', inlineRuntimeRegistry },
		);
	const documentHtml = (
		await Promise.all([renderContainer(), renderContainer(), renderContainer()])
	).join('');
	const inlineSources = extractAllResumerSources(documentHtml).join('\n');

	expect(countOccurrences(inlineSources, 'const M = globalThis.__marklessInlineSyncPolicy')).toBe(
		1,
	);
	expect(gzipSync(inlineSources).length).toBeLessThan(2000);
});

test('renderToString inline event resumer reads built-in graph values for sync policy', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl('map-policy');
	const html = await renderToString(
		() => ({
			html: '<button type="button">Filter</button>',
			state: createProtocolStatePayload({
				cells: [
					{
						graphNodeId: 'state:filters',
						name: 'filters',
						valueKind: 'object',
						value: new Map([['open', true]]),
					},
				],
			}),
			view: {
				...viewWithClick(),
				events: [
					{
						hostNodeId: 'h0',
						eventName: 'click',
						syncPolicy: {
							when: {
								type: 'graph-truthy',
								graphNodeId: 'state:filters',
								path: [],
							},
							actions: ['preventDefault'],
						},
						symbolIds: ['symbol:click'],
					},
				],
			},
		}),
		{ executionLog: 'never', resumeModuleUrl },
	);
	const state = extractScriptText(html, 'markless/state');
	const view = JSON.parse(extractScriptText(html, 'markless/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="markless/state"]') return { textContent: state };
		if (selector === 'script[type="markless/view"]')
			return { textContent: JSON.stringify(view) };
		return null;
	};
	root.addEventListener = (type, listener, options) => {
		const capture =
			options === true || (typeof options === 'object' && options.capture === true);
		if (type === 'click' && capture) listeners.push(listener);
	};
	const document = {
		currentScript: {
			closest(selector: string) {
				return selector === '[data-async-container]' ? root : null;
			},
		},
		createTreeWalker() {
			const nodes = [button];
			return {
				nextNode() {
					return nodes.shift() ?? null;
				},
			};
		},
	};
	const globalScope = globalThis as typeof globalThis & {
		document?: unknown;
		__asyncResumerSyncPolicyTest?: {
			order: string[];
		};
	};
	const previousDocument = globalScope.document;
	const previousTestState = globalScope.__asyncResumerSyncPolicyTest;
	globalScope.document = document;
	globalScope.__asyncResumerSyncPolicyTest = { order: [] };

	try {
		await import(`data:text/javascript,${encodeURIComponent(resumerSource)}`);

		await listeners[0]({
			type: 'click',
			target: button,
			defaultPrevented: false,
			propagationStopped: false,
			preventDefault() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('preventDefault');
				this.defaultPrevented = true;
			},
			stopPropagation() {
				globalScope.__asyncResumerSyncPolicyTest?.order.push('stopPropagation');
				this.propagationStopped = true;
			},
		} as FakeEvent);

		expect(globalScope.__asyncResumerSyncPolicyTest).toEqual({
			order: ['preventDefault', 'import', 'handler:true:false:true'],
		});
	} finally {
		if (previousDocument === undefined) {
			delete globalScope.document;
		} else {
			globalScope.document = previousDocument;
		}
		if (previousTestState === undefined) {
			delete globalScope.__asyncResumerSyncPolicyTest;
		} else {
			globalScope.__asyncResumerSyncPolicyTest = previousTestState;
		}
	}
});

function extractScriptText(html: string, type: 'markless/state' | 'markless/view'): string {
	const pattern = new RegExp(`<script type="${type}">([\\s\\S]*?)<\\/script>`);
	const match = pattern.exec(html);
	if (!match) throw new Error(`Expected ${type} script.`);
	return match[1]!;
}

function extractResumerSource(html: string): string {
	const match = /<script data-async-resumer(?: nonce="[^"]+")?>([\s\S]*?)<\/script>/.exec(html);
	if (!match) throw new Error('Expected inline resumer script.');
	return match[1]!;
}

function extractAllResumerSources(html: string): string[] {
	return [
		...html.matchAll(/<script data-async-resumer(?: nonce="[^"]+")?>([\s\S]*?)<\/script>/g),
	].map((match) => match[1]!);
}

function countOccurrences(source: string, needle: string): number {
	return source.split(needle).length - 1;
}

function createResumeModuleUrl(cacheKey = 'default'): string {
	const source = `
// ${cacheKey}
globalThis.__asyncResumerTest.imports++;
export async function resumeContainerEvent({ root, event }) {
	globalThis.__asyncResumerTest.events.push(event.type + ':' + root.tagName);
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function createResumeRuntimeStartedModuleUrl(cacheKey = 'runtime-started'): string {
	const source = `
// ${cacheKey}
globalThis.__asyncResumerTest.imports++;
export async function resumeContainerEvent({ root, event }) {
	globalThis.__asyncResumerTest.events.push(event.type + ':' + root.tagName);
	root.__asyncResumeRuntimeStarted = true;
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

function createSyncPolicyResumeModuleUrl(cacheKey = 'default'): string {
	const source = `
// ${cacheKey}
globalThis.__asyncResumerSyncPolicyTest.order.push('import');
export async function resumeContainerEvent({ event, syncPolicyAlreadyApplied }) {
	globalThis.__asyncResumerSyncPolicyTest.order.push(
		'handler:' + String(event.defaultPrevented) + ':' + String(event.propagationStopped) + ':' + String(syncPolicyAlreadyApplied),
	);
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}

test('render starts pending CSR async boundary runners and settles the range', async () => {
	const startAnchor = {
		nodeType: 8 as const,
		textContent: 'markless:async:boundary:0',
	} as unknown as FakeElement;
	const pending = element('P');
	const endAnchor = {
		nodeType: 8 as const,
		textContent: '/markless:async:boundary:0',
	} as unknown as FakeElement;
	const root = element('MAIN', [startAnchor, pending, endAnchor]);
	const target = {
		children: [] as FakeElement[],
		replaceChildren(...children: FakeElement[]) {
			this.children = children;
		},
	};
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:userId', name: 'userId', valueKind: 'scalar', value: 'ada' }],
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
		...viewWithAsyncBoundary(),
		locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'main' }],
		asyncBoundaries: viewWithAsyncBoundary().asyncBoundaries.map((boundary) => ({
			...boundary,
			updateSymbolId: 'symbol:boundary-update',
		})),
	};
	const loadedSymbols: string[] = [];
	const replacement = element('SPAN');

	const container = await render(
		() => ({
			root,
			state,
			view,
			loadSymbol(symbolId: string) {
				loadedSymbols.push(symbolId);
				if (symbolId === 'symbol:details-runner') {
					return async ({ key }) => ({ title: `User ${String(key)}` });
				}
				return ({ graph, status }) => ({
					arm: status === 'rejected' ? 1 : 0,
					html: `<span>${String(graph.read('computed:details', ['value', 'title']))}</span>`,
				});
			},
		}),
		{
			target,
			renderBranchHtml: () => [replacement as never],
		},
	);

	for (let index = 0; index < 6; index++) await Promise.resolve();
	await container.graph.flush?.();
	for (let index = 0; index < 6; index++) await Promise.resolve();

	// The CSR graph wires the boundary runner through loadSymbol, demands it at
	// creation, and the default CSR applier replaces the boundary range.
	expect(loadedSymbols).toEqual(['symbol:details-runner', 'symbol:boundary-update']);
	expect(
		root.childNodes.map((child) => (child.nodeType === 8 ? '#comment' : child.tagName)),
	).toEqual(['#comment', 'SPAN', '#comment']);
});
