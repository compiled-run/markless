import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@markless/serializer';
import { createProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
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
	for (const child of childNodes) {
		child.parentElement = node;
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

test('renderToString emits an SSR container and omits the resumer for static output', () => {
	let componentBodyRuns = 0;
	const html = renderToString(() => {
		componentBodyRuns++;
		return {
			html: '<p>Static</p>',
			state: createProtocolStatePayload({ cells: [] }),
			view: staticView(),
		};
	});

	expect(componentBodyRuns).toBe(1);
	expect(html).toContain('data-async-container');
	expect(html).toContain('<p>Static</p>');
	expect(html).toContain('type="markless/state"');
	expect(html).toContain('type="markless/view"');
	expect(html).not.toContain('data-async-resumer');
});

test('renderToString keeps fragment sibling roots as direct container children and offsets their locators', () => {
	const html = renderToString({
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

test('renderToString keeps async boundary anchors as the only comments in document order', () => {
	const html = renderToString(
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

test('renderToString emits one inline resumer for SSR containers with browser triggers', () => {
	const html = renderToString(
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

test('renderToString emits ordered modulepreload links before interactive payload startup', () => {
	const html = renderToString(
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

test('renderToString uses compiled artifact modulepreloads by default', () => {
	const html = renderToString({
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

test('renderToString uses the compiled artifact resume module URL by default', () => {
	const resumeModuleUrl = createResumeModuleUrl('artifact-default');
	const html = renderToString({
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
	const html = renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl },
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

test('renderToString inline event resumer steps aside after runtime startup', async () => {
	const resumeModuleUrl = createResumeRuntimeStartedModuleUrl();
	const html = renderToString(
		() => ({
			html: '<button type="button">Count 0</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithClick(),
		}),
		{ resumeModuleUrl },
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

test('renderToString event-only inline resumer omits sync-policy feature code', () => {
	const html = renderToString(
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
	const html = renderToString(
		() => ({
			html: '<button type="button">Close</button>',
			state: createProtocolStatePayload({ cells: [] }),
			view: viewWithSyncPolicy(),
		}),
		{ resumeModuleUrl },
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
	const html = renderToString(
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
		{ resumeModuleUrl },
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
			order: ['preventDefault', 'stopPropagation', 'import', 'handler:true:true'],
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
	const html = renderToString(
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
		{ resumeModuleUrl },
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
			order: ['preventDefault', 'import', 'handler:true:false'],
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

test('renderToString inline event resumer reads built-in graph values for sync policy', async () => {
	const resumeModuleUrl = createSyncPolicyResumeModuleUrl('map-policy');
	const html = renderToString(
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
		{ resumeModuleUrl },
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
			order: ['preventDefault', 'import', 'handler:true:false'],
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
export async function resumeContainerEvent({ event }) {
	globalThis.__asyncResumerSyncPolicyTest.order.push(
		'handler:' + String(event.defaultPrevented) + ':' + String(event.propagationStopped),
	);
}
`;
	return `data:text/javascript,${encodeURIComponent(source)}`;
}
