import type { ProtocolViewPayload } from '@markless/serializer';
import { expect, test, vi } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '../../serializer/src/index.ts';
import { resumeEventOnlyFromPayloadDocument } from '../src/event-only-resume.ts';
import {
	isScalarLeanResumeShape,
	resumeScalarEventFromPayloadDocument,
} from '../src/event-only-lean/scalar-resume.ts';

type FakeElement = {
	nodeType: 1;
	readonly tagName: string;
	readonly childNodes: FakeElement[];
	readonly parentElement?: FakeElement | null;
	readonly attributes: Record<string, string>;
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
};

type FakePayloadScript = {
	readonly textContent: string;
};

type FakePayloadDocument = {
	readonly scripts: Record<string, FakePayloadScript | undefined>;
	querySelector(selector: string): FakePayloadScript | null;
};

function element(tagName: string, childNodes: FakeElement[] = []): FakeElement {
	const node = {
		nodeType: 1 as const,
		tagName,
		childNodes,
		attributes: {},
		textContent: null,
		setAttribute(name: string, value: string) {
			this.attributes[name] = value;
		},
		removeAttribute(name: string) {
			delete this.attributes[name];
		},
	};
	for (const child of childNodes) {
		(child as { parentElement?: FakeElement }).parentElement = node;
	}
	return node;
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

function scalarRuntimeDemandMap(input: {
	readonly eventRecord: ProtocolViewPayload['events'][number];
	readonly domUpdate: ProtocolViewPayload['domUpdates'][number];
	readonly replaced?: boolean;
}): unknown {
	const replaced = input.replaced ?? true;
	return {
		recordKinds: [
			'async-boundary',
			'behavior',
			'branch',
			'dom-update',
			'element-handle',
			'event',
			'keyed-repeat',
		].map((kind) => ({
			kind,
			replaced: replaced && (kind === 'event' || kind === 'dom-update'),
		})),
		actions: [
			{
				hostNodeId: input.eventRecord.hostNodeId,
				eventName: input.eventRecord.eventName,
				recordKind: 'event',
				recordKinds: ['event', 'dom-update'],
				payloadRecordIds: [
					`event:${input.eventRecord.hostNodeId}:${input.eventRecord.eventName}`,
					`dom-update:${input.domUpdate.hostNodeId}:${input.domUpdate.symbolId ?? ''}`,
				],
				plan: {
					version: 1,
					kind: 'scalar',
					symbolId: input.eventRecord.symbolIds[0],
					cell: input.domUpdate.graphNodeId,
					write: { kind: 'assign', value: 1 },
					textUpdates: [
						{
							hostNodeId: input.domUpdate.hostNodeId,
							graphNodeId: input.domUpdate.graphNodeId,
							symbolId: input.domUpdate.symbolId,
						},
					],
				},
			},
		],
	};
}

function rowRuntimeDemandMap(input: {
	readonly repeat: NonNullable<ProtocolViewPayload['keyedRepeats']>[number];
	readonly rowEvent: NonNullable<
		ProtocolViewPayload['keyedRepeats']
	>[number]['rowEvents'][number];
	readonly domUpdate: ProtocolViewPayload['domUpdates'][number];
	readonly replaced?: boolean;
}): unknown {
	const replaced = input.replaced ?? true;
	return {
		recordKinds: [
			'async-boundary',
			'behavior',
			'branch',
			'dom-update',
			'element-handle',
			'event',
			'keyed-repeat',
		].map((kind) => ({
			kind,
			replaced: replaced && (kind === 'dom-update' || kind === 'keyed-repeat'),
		})),
		actions: [
			{
				hostNodeId: input.repeat.parentHostNodeId,
				eventName: input.rowEvent.eventName,
				recordKind: 'keyed-repeat-row',
				recordKinds: ['dom-update', 'keyed-repeat'],
				payloadRecordIds: [
					`dom-update:${input.domUpdate.hostNodeId}:${input.domUpdate.symbolId ?? ''}`,
					`keyed-repeat:${input.repeat.id}`,
				],
				plan: {
					version: 1,
					kind: 'row',
					symbolId: input.rowEvent.symbolIds[0],
					cell: input.domUpdate.graphNodeId,
					write: {
						kind: 'assign',
						localPath: [input.repeat.itemName, ...(input.repeat.keyPath ?? [])],
					},
					textUpdates: [
						{
							hostNodeId: input.domUpdate.hostNodeId,
							graphNodeId: input.domUpdate.graphNodeId,
							symbolId: input.domUpdate.symbolId,
						},
					],
					repeatId: input.repeat.id,
					fullDecodeCells: input.repeat.collectionGraphNodeId
						? [input.repeat.collectionGraphNodeId]
						: [],
				},
			},
		],
	};
}

test('event-only scalar lean route rejects a tampered consumed cell slot', async () => {
	const button = element('BUTTON');
	const root = element('DIV', [button, element('OUTPUT')]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const eventRecord = { hostNodeId: 'hButton', eventName: 'click', symbolIds: ['symbol:event'] };
	const domUpdate = {
		hostNodeId: 'hOutput',
		source: 'count',
		graphNodeId: 'state:count',
		path: [],
		target: { kind: 'text' as const },
		symbolId: 'symbol:text',
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'hButton', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'hOutput', strategy: 'dom-order', index: 2, tagName: 'output' },
		],
		events: [eventRecord],
		domUpdates: [domUpdate],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const runtimeDemandMap = scalarRuntimeDemandMap({ eventRecord, domUpdate }) as {
		actions: Array<{
			plan: { write: { kind: string; updateOperator?: string }; textUpdates: unknown[] };
		}>;
	};
	runtimeDemandMap.actions[0]!.plan.write = { kind: 'update', updateOperator: '++' };
	const tamperedCell = {
		...state.cells[0]!,
		value: { version: 1, root: { $type: 'date', value: 'not-a-date' }, records: [] },
	};
	const scripts = renderPayloadScripts({ state: { ...state, cells: [tamperedCell] }, view });

	await expect(
		resumeScalarEventFromPayloadDocument({
			document: payloadDocument(scripts.stateScript, scripts.viewScript),
			root,
			event: { type: 'click', target: button },
			eventRecord,
			runtimeDemandMap,
			loadSymbol: () => () => undefined,
		}),
	).rejects.toMatchObject({
		code: 'MARKLESS_PAYLOAD_INVALID',
		message: expect.stringContaining('markless/state cell[0].value.root'),
		payloadType: 'markless/state',
		docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
	});
});

test('event-only scalar lean route keeps only the dispatched record and text subscribers', async () => {
	const button = element('BUTTON');
	const output = element('OUTPUT');
	const other = element('SPAN');
	const section = element('SECTION', [button, output, other]);
	const root = element('DIV', [section]);
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 },
			{ graphNodeId: 'state:other', name: 'other', valueKind: 'scalar', value: 10 },
		],
	});
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h4', strategy: 'dom-order', index: 1, tagName: 'section' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 2, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 3, tagName: 'output' },
			{ hostNodeId: 'h3', strategy: 'dom-order', index: 4, tagName: 'span' },
		],
		events: [
			{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] },
			{ hostNodeId: 'h3', eventName: 'mouseover', symbolIds: ['symbol:other'] },
		],
		domUpdates: [
			{
				hostNodeId: 'h2',
				source: 'count',
				graphNodeId: 'state:count',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
			{
				hostNodeId: 'h3',
				source: 'other',
				graphNodeId: 'state:other',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:otherText',
			},
		],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	const runtimeDemandMap = scalarRuntimeDemandMap({
		eventRecord: view.events[0],
		domUpdate: view.domUpdates[0],
	});

	expect(
		isScalarLeanResumeShape({ state, view, eventRecord: view.events[0], runtimeDemandMap }),
	).toBe(true);

	const result = await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		eventRecord: view.events[0],
		runtimeDemandMap,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:event') {
				return ({ graph }) =>
					graph.update({
						graphNodeId: 'state:count',
						update(value) {
							return Number(value) + 1;
						},
					});
			}
			return ({ value }) => ({ type: 'setText', locator: 'h2', value });
		},
	});

	expect(result.view.events).toEqual([view.events[0]]);
	expect(result.view.domUpdates).toEqual([view.domUpdates[0]]);
	expect(result.view.locators.map((locator) => locator.hostNodeId)).toEqual(['h1', 'h2']);
	expect(result.graph.read('state:count')).toBe(1);
	expect(output.textContent).toBe('1');
});

test('event-only scalar lean route falls back to the full event container for behavior records', async () => {
	const button = element('BUTTON');
	const output = element('OUTPUT');
	const root = element('DIV', [button, output]);
	const state = createProtocolStatePayload({
		cells: [{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: 0 }],
	});
	const eventRecord = { hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] };
	const domUpdate = {
		hostNodeId: 'h2',
		source: 'count',
		graphNodeId: 'state:count',
		path: [],
		target: { kind: 'text' as const },
		symbolId: 'symbol:text',
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
			{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			{ hostNodeId: 'h2', strategy: 'dom-order', index: 2, tagName: 'output' },
		],
		events: [eventRecord],
		domUpdates: [domUpdate],
		behaviors: [
			{
				hostNodeId: 'h0',
				source: 'installController',
				functionSource: 'installController',
				inputSources: [],
				symbolId: 'symbol:behavior',
			},
		],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const runtimeDemandMap = scalarRuntimeDemandMap({ eventRecord, domUpdate });
	const scripts = renderPayloadScripts({ state, view });

	expect(isScalarLeanResumeShape({ state, view, eventRecord, runtimeDemandMap })).toBe(false);
	const fullResume = vi.fn(async () => undefined);

	await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		eventRecord,
		runtimeDemandMap,
		loadSymbol: () => () => undefined,
		loadFullResume: fullResume,
	});

	expect(fullResume).toHaveBeenCalled();
	expect(output.textContent).toBe(null);
	expect(root.attributes['data-controller']).toBeUndefined();
});

test('event-only scalar lean row route dispatches scalar writes and ignores handler returns', async () => {
	const button = element('BUTTON');
	const row = element('ARTICLE', [button]);
	const parent = element('SECTION', [row]);
	const output = element('OUTPUT');
	const root = element('DIV', [parent, output]);
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:chosen', name: 'chosen', valueKind: 'scalar', value: 'none' },
			{
				graphNodeId: 'state:cards',
				name: 'cards',
				valueKind: 'array',
				value: [{ key: 'north' }],
			},
		],
	});
	const domUpdate = {
		hostNodeId: 'hOutput',
		source: 'chosen',
		graphNodeId: 'state:chosen',
		path: [],
		target: { kind: 'text' as const },
		symbolId: 'symbol:text',
	};
	const repeat = {
		id: 'repeat:0',
		parentHostNodeId: 'hParent',
		collectionGraphNodeId: 'state:cards',
		collectionPath: [],
		keyPath: ['key'],
		itemName: 'card',
		rowElementCount: 1,
		rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row'] }],
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [
			{ hostNodeId: 'hParent', strategy: 'dom-order', index: 1, tagName: 'section' },
			{ hostNodeId: 'hOutput', strategy: 'dom-order', index: 4, tagName: 'output' },
		],
		events: [],
		domUpdates: [domUpdate],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [repeat],
		branches: [],
		asyncBoundaries: [],
	};
	const runtimeDemandMap = rowRuntimeDemandMap({
		repeat,
		rowEvent: repeat.rowEvents[0],
		domUpdate,
	});
	const scripts = renderPayloadScripts({ state, view });

	expect(isScalarLeanResumeShape({ state, view, eventName: 'click', runtimeDemandMap })).toBe(
		true,
	);

	await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		runtimeDemandMap,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:row') {
				return ({ graph, locals }) => {
					graph.write({
						graphNodeId: 'state:chosen',
						value: (locals!.card as { readonly key: string }).key,
					});
					return { type: 'setText', locator: 'hOutput', value: 'handler-return-ignored' };
				};
			}
			return ({ value }) => ({ type: 'setText', locator: 'hOutput', value });
		},
	});

	expect(output.textContent).toBe('north');
});

test('event-only scalar lean row fallback creates the full event path cold', async () => {
	const button = element('BUTTON');
	const parent = element('SECTION', [element('ARTICLE', [button])]);
	const root = element('DIV', [parent]);
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'state:chosen', name: 'chosen', valueKind: 'scalar', value: 'none' },
			{
				graphNodeId: 'state:cards',
				name: 'cards',
				valueKind: 'array',
				value: [{ key: 'north' }],
			},
		],
	});
	const domUpdate = {
		hostNodeId: 'hParent',
		source: 'chosen',
		graphNodeId: 'state:chosen',
		path: [],
		target: { kind: 'attribute' as const, name: 'data-selected' },
		symbolId: 'symbol:attr',
	};
	const repeat = {
		id: 'repeat:0',
		parentHostNodeId: 'hParent',
		collectionGraphNodeId: 'state:cards',
		collectionPath: [],
		keyPath: ['key'],
		itemName: 'card',
		rowElementCount: 2,
		rowEvents: [{ hostPath: [0], eventName: 'click', symbolIds: ['symbol:row'] }],
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [{ hostNodeId: 'hParent', strategy: 'dom-order', index: 1, tagName: 'section' }],
		events: [],
		domUpdates: [domUpdate],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [repeat],
		branches: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view });
	let coldFullFallback = false;

	expect(
		isScalarLeanResumeShape({
			state,
			view,
			eventName: 'click',
			runtimeDemandMap: rowRuntimeDemandMap({
				repeat,
				rowEvent: repeat.rowEvents[0],
				domUpdate,
			}),
		}),
	).toBe(false);

	await resumeScalarEventFromPayloadDocument({
		document: payloadDocument(scripts.stateScript, scripts.viewScript),
		root,
		event: { type: 'click', target: button },
		runtimeDemandMap: rowRuntimeDemandMap({
			repeat,
			rowEvent: repeat.rowEvents[0],
			domUpdate,
			replaced: false,
		}),
		loadSymbol: () => () => undefined,
		loadFullResume() {
			coldFullFallback = true;
		},
	} as Parameters<typeof resumeScalarEventFromPayloadDocument>[0] & {
		readonly loadFullResume: () => void;
	});

	expect(coldFullFallback).toBe(true);
});

test('event-only resume routes non-lean served view records to the full runtime', async () => {
	for (const extra of [
		{
			branches: [
				{
					id: 'branch-site:0',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					symbolId: 'symbol:branch',
					testReads: [],
				},
			],
		},
		{ futureRecords: [{ id: 'future:0' }] },
	]) {
		const button = element('BUTTON');
		const root = element('DIV', [button]);
		const state = createProtocolStatePayload({ cells: [] });
		const view = {
			version: 1,
			locators: [
				{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'div' },
				{ hostNodeId: 'h1', strategy: 'dom-order', index: 1, tagName: 'button' },
			],
			events: [{ hostNodeId: 'h1', eventName: 'click', symbolIds: ['symbol:event'] }],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
			...extra,
		} as ProtocolViewPayload & {
			readonly futureRecords?: ReadonlyArray<{ readonly id: string }>;
		};
		const scripts = renderPayloadScripts({ state, view });
		const document = payloadDocument(scripts.stateScript, scripts.viewScript);
		const fullResume = vi.fn(async () => undefined);
		const loadSymbol = vi.fn(() => () => undefined);

		await resumeEventOnlyFromPayloadDocument({
			document,
			root,
			event: { type: 'click', target: button },
			loadSymbol,
			loadFullResume: fullResume,
		} as Parameters<typeof resumeEventOnlyFromPayloadDocument>[0] & {
			readonly loadFullResume: typeof fullResume;
		});

		expect(fullResume).toHaveBeenCalledWith(
			expect.objectContaining({ document, root, loadSymbol }),
		);
		expect(loadSymbol).not.toHaveBeenCalled();
	}
});
