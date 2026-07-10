import { expect, test } from 'vitest';
import {
	ASYNC_PROTOCOL_VERSION,
	decodePayloadScripts,
	MARKLESS_STATE_PATCH_SCRIPT_TYPE,
	renderPayloadScripts,
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

test('streamed state patches use the owned protocol script type', () => {
	expect(MARKLESS_STATE_PATCH_SCRIPT_TYPE).toBe('markless/state-patch');
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
