import { expect, test } from 'vite-plus/test';
import type { ProtocolViewPayload } from '../../protocol/src/index.ts';
import { createResumeRuntime, createRuntimeGraph } from '../../runtime/src/index.ts';
import { createProtocolStatePayload } from '../../serializer/src/index.ts';
import { cleanup, render } from '../src/index.ts';

type SyncComputedExpression =
	| {
			readonly kind: 'read';
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
	  }
	| {
			readonly kind: 'literal';
			readonly value: unknown;
	  }
	| {
			readonly kind: 'binary';
			readonly operator: '+' | '-' | '*' | '/';
			readonly left: SyncComputedExpression;
			readonly right: SyncComputedExpression;
	  };

test('browser runtime updates state-backed DOM after an event', async () => {
	const { button } = await renderCounter({
		state: createProtocolStatePayload({
			cells: [
				{
					graphNodeId: 'state:count',
					name: 'count',
					valueKind: 'scalar',
					value: 0,
				},
			],
		}),
		domUpdates: [
			{
				hostNodeId: 'h1',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:count-text',
			},
		],
	});

	button.click();
	await settleBrowserEvents();

	expect(button.textContent).toBe('1');

	await cleanup();
});

test('browser runtime recomputes sync computed text after state changes', async () => {
	const doubleExpression: SyncComputedExpression = {
		kind: 'binary',
		operator: '*',
		left: { kind: 'read', graphNodeId: 'state:count', path: [] },
		right: { kind: 'literal', value: 2 },
	};
	const { double } = await renderCounter({
		state: createProtocolStatePayload({
			cells: [
				{
					graphNodeId: 'state:count',
					name: 'count',
					valueKind: 'scalar',
					value: 0,
				},
			],
			computed: [
				{
					graphNodeId: 'computed:double',
					name: 'double',
					async: false,
					dependencies: [{ graphNodeId: 'state:count', path: [] }],
					expression: doubleExpression,
				} as NonNullable<
					Parameters<typeof createProtocolStatePayload>[0]['computed']
				>[number] & {
					readonly expression: SyncComputedExpression;
				},
			],
		}),
		domUpdates: [
			{
				hostNodeId: 'h2',
				source: 'double',
				graphNodeId: 'computed:double',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:double-text',
			},
		],
	});

	document.querySelector<HTMLButtonElement>('[data-counter]')?.click();
	await settleBrowserEvents();

	expect(double.textContent).toBe('2');

	await cleanup();
});

test('browser runtime reads and writes shared graph properties', () => {
	const graph = createRuntimeGraph({
		cells: [
			{
				graphNodeId: 'shared:src/session.tsrx#session/state:data',
				value: { user: null, status: 'anonymous' },
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

	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('anonymous');
	expect(
		graph.writeShared({
			definitionId: 'shared:src/session.tsrx#session',
			propertyName: 'status',
			value: 'ready',
		}),
	).toBe(true);
	expect(graph.readShared('shared:src/session.tsrx#session', 'status')).toBe('ready');
});

test('browser render exposes element() handles through runtime locators', async () => {
	const root = document.createElement('section');
	const input = document.createElement('input');
	root.append(input);
	const runtime = createResumeRuntime({
		root,
		graph: createRuntimeGraph({ cells: [] }),
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'input' },
			],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [{ hostNodeId: 'h1', handleId: 'element:input', name: 'input' }],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			throw new Error(`Unexpected symbol load: ${symbolId}`);
		},
	});

	await runtime.start();

	expect(runtime.getElement('h1')).toBe(input);
});

async function renderCounter(input: {
	readonly state: ReturnType<typeof createProtocolStatePayload>;
	readonly domUpdates: ProtocolViewPayload['domUpdates'];
}): Promise<{
	readonly button: HTMLButtonElement;
	readonly double: HTMLOutputElement;
}> {
	const root = document.createElement('section');
	const button = document.createElement('button');
	const double = document.createElement('output');
	button.dataset.counter = '';
	button.textContent = '0';
	double.textContent = '0';
	root.append(button, double);

	await render(() => ({
		root,
		state: input.state,
		view: {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'section' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
				{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'output' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:increment'] }],
			domUpdates: input.domUpdates,
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		},
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:increment') {
				return (context) => {
					context.graph.update({
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
				locator: context.domUpdate?.hostNodeId ?? 'h1',
				value: context.value,
			});
		},
	}));

	return { button, double };
}

async function settleBrowserEvents(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}
