import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../../serializer/src/index.ts';
import { createLeanScalarGraph } from '../../src/event-only-lean/lean-shared.ts';
import {
	isScalarCoreLeanResumeShape,
	resumeScalarCoreEventFromPayloadDocument,
} from '../../src/event-only-lean/scalar-core.ts';

const NON_FINITE = [
	['Infinity', Number.POSITIVE_INFINITY],
	['-Infinity', Number.NEGATIVE_INFINITY],
	['NaN', Number.NaN],
] as const;

function statePayload(value: unknown) {
	return createProtocolStatePayload({
		cells: [{ graphNodeId: 'limit', name: 'limit', valueKind: 'scalar', value }],
	});
}

type FakeElement = {
	nodeType: 1;
	tagName: string;
	childNodes: FakeElement[];
	parentElement: FakeElement | null;
	textContent?: string | null;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node: FakeElement = { nodeType: 1, tagName, childNodes, parentElement: null };
	for (const child of childNodes) child.parentElement = node;
	return node;
}

function payloadDocument(state: unknown, view: unknown) {
	const scripts = renderPayloadScripts({ state, view } as never);
	return {
		querySelector(selector: string) {
			const source = selector.includes('state') ? scripts.stateScript : scripts.viewScript;
			return {
				textContent: source.replace(/^<script[^>]*>/, '').replace('</script>', ''),
			};
		},
	};
}

const eventRecord = { hostNodeId: 'button', eventName: 'click', symbolIds: ['event'] };

function view(locators: ReadonlyArray<unknown>) {
	return {
		version: 1,
		locators,
		events: [eventRecord],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [],
		branches: [],
		asyncBoundaries: [],
	};
}

// `++` on a non-finite cell is a no-op write, so what the lane reports is what
// its decoder produced from the served slot and nothing the plan wrote.
const demandMap = {
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
				cell: 'limit',
				write: { kind: 'update', updateOperator: '++' },
				textUpdates: [],
			},
		},
	],
};

test.each(NON_FINITE)('the lean shared scalar graph decodes the %s tag', async (_name, value) => {
	const state = statePayload(value);
	const root = {} as never;
	const graph = await createLeanScalarGraph(
		{
			locators: [],
			domUpdates: [],
			keyedRepeats: [],
			cells: state.cells,
			fullDecodeCellIds: new Set(),
		} as never,
		new Map(),
		(() => () => undefined) as never,
		root,
	);

	expect(graph.read('limit')).toBe(value);
});

test('the lean shared scalar graph leaves a finite cell alone', async () => {
	const state = statePayload(3.5);
	const graph = await createLeanScalarGraph(
		{
			locators: [],
			domUpdates: [],
			keyedRepeats: [],
			cells: state.cells,
			fullDecodeCellIds: new Set(),
		} as never,
		new Map(),
		(() => () => undefined) as never,
		{} as never,
	);

	expect(graph.read('limit')).toBe(3.5);
});

test.each(NON_FINITE)(
	'the scalar-core payload validator accepts the %s tag as lean shape',
	(_name, value) => {
		expect(
			isScalarCoreLeanResumeShape({
				state: statePayload(value),
				view: view([]),
				eventRecord,
				runtimeDemandMap: demandMap,
			} as never),
		).toBe(true);
	},
);

test('the scalar-core payload validator still refuses a malformed number tag', () => {
	expect(() =>
		isScalarCoreLeanResumeShape({
			state: {
				version: 1,
				cells: [
					{
						graphNodeId: 'limit',
						name: 'limit',
						valueKind: 'scalar',
						value: { version: 1, root: { $type: 'number', value: 'huge' }, records: [] },
					},
				],
				computed: [],
			},
			view: view([]),
			eventRecord,
			runtimeDemandMap: demandMap,
		} as never),
	).toThrow(expect.objectContaining({ code: 'MARKLESS_PAYLOAD_INVALID' }));
});

test.each(NON_FINITE)('the scalar-core resume lane reads a %s cell', async (_name, value) => {
	const button = element('BUTTON');
	const root = element('DIV', [element('SECTION', [button])]);
	const locators = [{ hostNodeId: 'button', strategy: 'dom-order', index: 2, tagName: 'button' }];
	let seen: unknown;

	await resumeScalarCoreEventFromPayloadDocument({
		root,
		document: payloadDocument(statePayload(value), view(locators)),
		event: { type: 'click', target: button },
		eventRecord,
		runtimeDemandMap: demandMap,
		loadSymbol: () => (context: { readonly graph: { read: (id: string) => unknown } }) => {
			seen = context.graph.read('limit');
		},
	} as never);

	expect(seen).toBe(value);
});
