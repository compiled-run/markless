import { ASYNC_PROTOCOL_VERSION, type ProtocolViewPayload } from '@arcade/protocol';
import { createProtocolStatePayload } from '@arcade/serializer';
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

test('render creates a client-render container without payload scripts or the inline resumer', async () => {
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
	expect(container.phase).toBe('client-render');
	expect(container.payloadScripts).toBeUndefined();
	expect(container.resumerScript).toBeUndefined();
	expect(loadedSymbols).toEqual([]);

	await container.root.listeners[0].listener(event('click', container.root));

	expect(loadedSymbols).toEqual(['symbol:click']);
	expect(container.graph.read('state:count')).toBe(1);
});

test('render uses the narrow client-render event path to apply DOM update symbols', async () => {
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
	expect(html).toContain('type="arcade/state"');
	expect(html).toContain('type="arcade/view"');
	expect(html).not.toContain('data-async-resumer');
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
	expect(html).toContain('<script type="arcade/state">');
	expect(html).toContain('<script type="arcade/view">');
	expect(html.indexOf('<script type="arcade/view">')).toBeLessThan(
		html.indexOf('data-async-resumer'),
	);
	expect(html).toContain('<script data-async-resumer nonce="nonce-1">');
	expect(html).toContain('globalThis.__started');
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
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	expect(resumerSource).not.toContain('preventDefault');
	expect(resumerSource).not.toContain('stopPropagation');
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="arcade/view"]' ? { textContent: JSON.stringify(view) } : null;
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
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="arcade/view"]' ? { textContent: JSON.stringify(view) } : null;
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
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="arcade/view"]' ? { textContent: JSON.stringify(view) } : null;
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
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) =>
		selector === 'script[type="arcade/view"]' ? { textContent: JSON.stringify(view) } : null;
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
	const state = extractScriptText(html, 'arcade/state');
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="arcade/state"]') return { textContent: state };
		if (selector === 'script[type="arcade/view"]') return { textContent: JSON.stringify(view) };
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
	const state = extractScriptText(html, 'arcade/state');
	const view = JSON.parse(extractScriptText(html, 'arcade/view')) as ProtocolViewPayload;
	const resumerSource = extractResumerSource(html);
	const button = element('BUTTON');
	const root = element('DIV', [button]);
	const listeners: Array<(event: FakeEvent) => Promise<void>> = [];
	root.querySelector = (selector) => {
		if (selector === 'script[type="arcade/state"]') return { textContent: state };
		if (selector === 'script[type="arcade/view"]') return { textContent: JSON.stringify(view) };
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

function extractScriptText(html: string, type: 'arcade/state' | 'arcade/view'): string {
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
