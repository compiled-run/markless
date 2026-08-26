import { expect, test } from 'vitest';
import {
	ASYNC_BOUNDARY_ARM,
	ASYNC_PROTOCOL_VERSION,
	decodePayloadScripts,
	renderPayloadScripts,
	STORAGE_PROTOCOL_VERSION,
	type ProtocolArmRecordSet,
	type ProtocolStatePayload,
	type ProtocolStreamedArmPatch,
	type ProtocolViewPayload,
} from '../src/index.ts';

test('streamed arm patches keep the served arm beside its records', () => {
	const patch = [
		ASYNC_BOUNDARY_ARM.try,
		{ locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [] },
	] satisfies ProtocolStreamedArmPatch;

	expect(JSON.stringify(patch)).toBe('[0,{"locators":[],"events":[],"domUpdates":[],"behaviors":[],"elementHandles":[]}]');
});

test('protocol payloads share the current async protocol version', () => {
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	expect(ASYNC_PROTOCOL_VERSION).toBe(1);
	expect(state.version).toBe(1);
	expect(view.version).toBe(1);
});

test('protocol versions 1 and 2 round-trip and unknown versions remain rejected', () => {
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const stateV1: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
	const stateV2: ProtocolStatePayload = {
		version: STORAGE_PROTOCOL_VERSION,
		cells: [
			{
				graphNodeId: 'storage:src/App.tsrx#theme-mode',
				name: 'theme',
				valueKind: 'scalar',
				value: { version: 1, root: 'light', records: [] },
			},
		],
		computed: [],
		storage: [
			{
				graphNodeId: 'storage:src/App.tsrx#theme-mode',
				key: 'theme-mode',
			},
		],
	};

	expect(decodePayloadScripts(renderPayloadScripts({ state: stateV1, view })).state).toEqual(
		stateV1,
	);
	expect(decodePayloadScripts(renderPayloadScripts({ state: stateV2, view })).state).toEqual(
		stateV2,
	);
	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({ state: { ...stateV2, version: 3 } as never, view }),
		),
	).toThrow(/Unsupported markless\/state protocol version 3/);
});

test.each([
	{
		name: 'missing cell',
		storage: [{ graphNodeId: 'storage:missing#theme-mode', key: 'theme-mode' }],
	},
	{
		name: 'invalid key',
		storage: [{ graphNodeId: 'storage:src/App.tsrx#theme-mode', key: 'theme mode' }],
	},
])('version 2 rejects $name storage metadata', ({ storage }) => {
	const state = {
		version: STORAGE_PROTOCOL_VERSION,
		cells: [
			{
				graphNodeId: 'storage:src/App.tsrx#theme-mode',
				name: 'theme',
				valueKind: 'scalar',
				value: { version: 1, root: 'light', records: [] },
			},
		],
		computed: [],
		storage,
	};
	const view = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	} as ProtocolViewPayload;

	expect(() =>
		decodePayloadScripts(renderPayloadScripts({ state: state as never, view })),
	).toThrow(/Invalid markless\/state storage\[0\]/);
});

// D3 graduation (T101/T107): async boundary arm records are first-class
// protocol types — the armized single set served by SSR and the compile-time
// per-arm plan array both cross the wire and round-trip payload scripts.
test('async boundary armRecords round-trip payload scripts in both protocol shapes', () => {
	const armized: ProtocolArmRecordSet = {
		locators: [{ hostNodeId: 'h3', strategy: 'arm-relative', index: 0, tagName: 'button' }],
		events: [{ hostNodeId: 'h3', eventName: 'click', symbolIds: ['symbol:3'] }],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [{
			id: 'repeat:rows',
			parentHostNodeId: 'h3',
			collectionGraphNodeId: 'computed:rows',
			collectionPath: [],
			keyPath: ['id'],
			itemName: 'row',
			rowElementCount: 1,
			rowEvents: [{ hostPath: [], eventName: 'click', symbolIds: ['symbol:row'] }],
		}],
		branches: [],
	};
	const boundaryBase = {
		startAnchor: { strategy: 'dom-order-comment', index: 0 },
		endAnchor: { strategy: 'dom-order-comment', index: 1 },
		runnerGraphNodeId: 'computed:rows',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
		asyncReads: [{ source: 'rows', graphNodeId: 'computed:rows', path: [] }],
	} as const;
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [
			{ ...boundaryBase, id: 'async:0', armRecords: armized },
			{
				...boundaryBase,
				id: 'async:1',
				startAnchor: { strategy: 'dom-order-comment', index: 2 },
				endAnchor: { strategy: 'dom-order-comment', index: 3 },
				armRecords: [
					armized,
					{ locators: [], events: [], behaviors: [], elementHandles: [] },
				],
			},
		],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));

	expect(decoded.view.asyncBoundaries[0]?.armRecords).toEqual(armized);
	expect(Array.isArray(decoded.view.asyncBoundaries[1]?.armRecords)).toBe(true);
	expect(decoded.view.asyncBoundaries[0]).toMatchObject({
		runnerGraphNodeId: 'computed:rows',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
	});
});

test.each([
	['missing runnerGraphNodeId', { initiallyServedArm: ASYNC_BOUNDARY_ARM.pending }],
	[
		'non-string runnerGraphNodeId',
		{ runnerGraphNodeId: 7, initiallyServedArm: ASYNC_BOUNDARY_ARM.pending },
	],
	['missing initiallyServedArm', { runnerGraphNodeId: 'computed:rows' }],
	['unknown initiallyServedArm', { runnerGraphNodeId: 'computed:rows', initiallyServedArm: 3 }],
])('async boundary records reject %s', (_label, fields) => {
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
	const view = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [
			{
				id: 'async:0',
				startAnchor: { strategy: 'dom-order-comment', index: 0 },
				endAnchor: { strategy: 'dom-order-comment', index: 1 },
				asyncReads: [],
				...fields,
			},
		],
	};

	expect(() => decodePayloadScripts(renderPayloadScripts({ state, view } as never))).toThrow(
		/runnerGraphNodeId|initiallyServedArm/,
	);
});

// directValue is the LIVE-value channel (CSR mounts, T105): it must never be
// served. A payload script still carrying one is a host bug — fail loud.
test('served state payloads reject live directValue cells', () => {
	const state = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [
			{
				graphNodeId: 'prop:props',
				name: 'props',
				valueKind: 'object',
				directValue: { a: 1 },
			},
		],
		computed: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};

	expect(() =>
		decodePayloadScripts(renderPayloadScripts({ state: state as never, view })),
	).toThrow(/directValue/);
});

// A keyed repeat's `@empty` arm markup crosses the wire on the repeat record,
// and a malformed one is refused where every other malformed record is: at the
// payload boundary, before resume can act on it.
test('keyed repeat @empty arm markup round-trips and refuses a malformed shape', () => {
	const repeat = {
		id: 'repeat:rows',
		parentHostNodeId: 'h0',
		collectionGraphNodeId: 'state:rows',
		collectionPath: [],
		keyPath: ['id'],
		itemName: 'row',
		rowElementCount: 1,
		rowStartOffset: 1,
		emptyArm: { html: '<li>nothing</li>' },
		rowEvents: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [repeat],
		asyncBoundaries: [],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	expect(decoded.view.keyedRepeats?.[0]?.emptyArm).toEqual({ html: '<li>nothing</li>' });

	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: { ...view, keyedRepeats: [{ ...repeat, emptyArm: { html: 7 } }] } as never,
			}),
		),
	).toThrow(/keyedRepeat\[0\]\.emptyArm/);
});

// A keyed repeat's row markup crosses the wire on the same record, and is
// refused in the same place: the mint builds a row from this and nothing else,
// so a malformed template must never reach it.
test('keyed repeat row markup round-trips and refuses a malformed shape', () => {
	const rowTemplate = {
		html: '<li><b><!--markless-slot:0--></b></li>',
		textSlots: [{ path: [0, 0, 0], itemPath: ['title'] }],
	};
	const repeat = {
		id: 'repeat:rows',
		parentHostNodeId: 'h0',
		collectionGraphNodeId: 'state:rows',
		collectionPath: [],
		keyPath: ['id'],
		itemName: 'row',
		rowElementCount: 1,
		rowTemplate,
		rowEvents: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [repeat],
		asyncBoundaries: [],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	expect(decoded.view.keyedRepeats?.[0]?.rowTemplate).toEqual(rowTemplate);

	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: { ...view, keyedRepeats: [{ ...repeat, rowTemplate: { html: 7 } }] } as never,
			}),
		),
	).toThrow(/keyedRepeat\[0\]\.rowTemplate/);

	// A path is a walk to a node, so a negative or fractional step names nothing.
	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: {
					...view,
					keyedRepeats: [
						{
							...repeat,
							rowTemplate: { ...rowTemplate, textSlots: [{ path: [-1], itemPath: ['title'] }] },
						},
					],
				} as never,
			}),
		),
	).toThrow(/keyedRepeat\[0\]\.rowTemplate\.textSlots\[0\]/);

	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: {
					...view,
					keyedRepeats: [
						{
							...repeat,
							rowTemplate: { ...rowTemplate, textSlots: [{ path: [0], itemPath: [7] }] },
						},
					],
				} as never,
			}),
		),
	).toThrow(/keyedRepeat\[0\]\.rowTemplate\.textSlots\[0\]/);
});

// A row whose content is a component crosses the wire as identity alone. The
// mint runs an edge from it, so a malformed identity must never reach it.
test('keyed repeat row component identity round-trips and refuses a malformed shape', () => {
	const rowComponent = {
		componentEdgeId: 'edge:0',
		componentName: 'App',
		itemPropName: 'item',
	};
	const repeat = {
		id: 'repeat:rows',
		parentHostNodeId: 'h0',
		collectionGraphNodeId: 'state:rows',
		collectionPath: [],
		keyPath: ['id'],
		itemName: 'row',
		rowElementCount: 0,
		rowComponent,
		rowEvents: [],
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		keyedRepeats: [repeat],
		asyncBoundaries: [],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	expect(decoded.view.keyedRepeats?.[0]?.rowComponent).toEqual(rowComponent);

	for (const malformed of [
		{ componentEdgeId: 'edge:0' },
		{ ...rowComponent, componentName: 7 },
		{ ...rowComponent, itemPropName: 7 },
	]) {
		expect(() =>
			decodePayloadScripts(
				renderPayloadScripts({
					state,
					view: { ...view, keyedRepeats: [{ ...repeat, rowComponent: malformed }] } as never,
				}),
			),
		).toThrow(/keyedRepeat\[0\]\.rowComponent/);
	}
});

// A read an arm renders with no element of its own to bind to. The field is the
// protocol's now, not the compiler's, so the wire refuses a malformed one.
test('branch content reads round-trip and refuse a malformed shape', () => {
	const contentReads = [{ graphNodeId: 'state:label', path: [], source: 'label' }];
	const branch = {
		id: 'branch:0',
		startAnchor: { strategy: 'dom-order-comment' as const, index: 0 },
		endAnchor: { strategy: 'dom-order-comment' as const, index: 1 },
		contentReads,
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		branches: [branch],
		asyncBoundaries: [],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	expect(decoded.view.branches?.[0]?.contentReads).toEqual(contentReads);

	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: {
					...view,
					branches: [{ ...branch, contentReads: [{ graphNodeId: 'g', path: [], source: 7 }] }],
				} as never,
			}),
		),
	).toThrow(/branch\[0\]\.contentReads\[0\]/);
});

// An escalating branch replaces its arm wholesale, so what it serves has to be
// arm-relative: page-absolute indexes would re-register against the wrong DOM.
test('served arm records need the escalates mark and arm-relative locators', () => {
	const armRecords = {
		locators: [
			{ hostNodeId: 'h0', tagName: 'EM', strategy: 'arm-relative' as const, index: 0 },
		],
		events: [],
		behaviors: [],
		elementHandles: [],
		domUpdates: [],
		branches: [],
	};
	const branch = {
		id: 'branch:0',
		startAnchor: { strategy: 'dom-order-comment' as const, index: 0 },
		endAnchor: { strategy: 'dom-order-comment' as const, index: 1 },
		escalates: true as const,
		servedArmRecords: armRecords,
	};
	const view: ProtocolViewPayload = {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		branches: [branch],
		asyncBoundaries: [],
	};
	const state: ProtocolStatePayload = {
		version: ASYNC_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};

	const decoded = decodePayloadScripts(renderPayloadScripts({ state, view }));
	expect(decoded.view.branches?.[0]?.escalates).toBe(true);
	expect(decoded.view.branches?.[0]?.servedArmRecords).toEqual(armRecords);

	const { escalates: _escalates, ...withoutMark } = branch;
	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({ state, view: { ...view, branches: [withoutMark] } as never }),
		),
	).toThrow(/servedArmRecords requires escalates/);

	expect(() =>
		decodePayloadScripts(
			renderPayloadScripts({
				state,
				view: {
					...view,
					branches: [
						{
							...branch,
							servedArmRecords: {
								...armRecords,
								locators: [
									{
										hostNodeId: 'h0',
										tagName: 'EM',
										strategy: 'dom-order',
										index: 4,
									},
								],
							},
						},
					],
				} as never,
			}),
		),
	).toThrow(/servedArmRecords\.locators\[0\]: expected arm-relative strategy/);
});
