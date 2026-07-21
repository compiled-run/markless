import { expect, test } from 'vitest';
import {
	ASYNC_PROTOCOL_VERSION,
	decodePayloadScripts,
	renderPayloadScripts,
	STORAGE_PROTOCOL_VERSION,
	type ProtocolArmRecordSet,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '../src/index.ts';

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
		storage: [{ graphNodeId: 'storage:src/App.tsrx#theme-mode', key: 'Theme_mode' }],
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
		branches: [],
	};
	const boundaryBase = {
		startAnchor: { strategy: 'dom-order-comment', index: 0 },
		endAnchor: { strategy: 'dom-order-comment', index: 1 },
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
