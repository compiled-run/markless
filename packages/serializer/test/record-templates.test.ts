import { expect, test } from 'vitest';
import {
	decodeProtocolPayloadLists,
	expandRecordTemplates,
	PROTOCOL_TEMPLATED_LISTS,
	type ProtocolTemplatedRecords,
} from '../src/protocol-record-templates.ts';
import {
	encodeProtocolPayloadLists,
	encodeRecordTemplates,
} from '../src/protocol-record-templates-encode.ts';
import { decodePayloadScripts } from '../src/protocol-client.ts';
import { renderPayloadScripts } from '../src/payload-scripts.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '../src/protocol.ts';

const rowUpdates = (count: number) =>
	Array.from({ length: count }, (_, row) => [
		{
			hostNodeId: `c${row + 3}:h2`,
			graphNodeId: `c0:p${row + 3}:computed:rowState`,
			path: [],
			target: { kind: 'attribute', name: 'data-state' },
			symbolId: `c0:p${row + 3}:symbol:5`,
		},
		{
			hostNodeId: `c${row + 3}:h7`,
			graphNodeId: `c0:p${row + 3}:computed:rowName`,
			path: [],
			target: { kind: 'text' },
			symbolId: `c0:p${row + 3}:symbol:6`,
		},
	]).flat();

const roundTrip = <T extends object>(list: readonly T[]) => {
	const encoded = encodeRecordTemplates(list);
	const wire = JSON.parse(JSON.stringify(encoded));
	return Array.isArray(wire) ? wire : expandRecordTemplates(wire as ProtocolTemplatedRecords);
};

test('rows that differ only by their instance numbers share one template per record', () => {
	const records = rowUpdates(50);
	const encoded = encodeRecordTemplates(records) as ProtocolTemplatedRecords;
	expect(Array.isArray(encoded)).toBe(false);
	expect(encoded.t).toHaveLength(2);
	expect(encoded.r[0]).toEqual([0, 3]);
	expect(encoded.r[99]).toEqual([1, 52]);
	expect(roundTrip(records)).toEqual(records);

	const perRow =
		(JSON.stringify(encodeRecordTemplates(rowUpdates(100))).length -
			JSON.stringify(encodeRecordTemplates(rowUpdates(50))).length) /
		50;
	expect(perRow).toBeLessThan(20);
});

test('a keyed row segment is one value, however its key is spelled', () => {
	const keys = ['Collections', '%2Fui%2Fpopover', 'u12', ''];
	const records = keys.map((key) => ({
		hostNodeId: `m0:r:${key}:c2:h2`,
		graphNodeId: `m0:r:${key}:c1:p2:computed:isClosed`,
		path: [],
		target: { kind: 'attribute', name: 'ui-closed' },
		symbolId: `m0:r:${key}:c1:p2:symbol:11`,
	}));
	const encoded = encodeRecordTemplates(records) as ProtocolTemplatedRecords;
	expect(encoded.t).toHaveLength(1);
	expect(roundTrip(records)).toEqual(records);
});

test('every value survives exactly: markers, leading zeros, long digit runs, numbers and markup', () => {
	const records = [0, 1, 2].map((i) => ({
		graphNodeId: `c${i}:state:x`,
		value: [
			`^${i}^^`,
			'007',
			`id-0${i}`,
			'12345678901234567890',
			i * 1.5,
			-i - 1,
			1e21 + i,
			'</script><!--',
			' \n"quoted"\\',
			{ nested: [`c${i}:h${i}`, null, true] },
		],
	}));
	expect(roundTrip(records)).toEqual(records);
});

test('a list whose records are all unlike stays a plain array', () => {
	const records = [
		{ hostNodeId: 'h0', handleId: 'element:a', name: 'a' },
		{ graphNodeId: 'state:b', path: ['x'] },
	];
	expect(encodeRecordTemplates(records)).toBe(records);
});

test('a record no other record shares is served as itself inside a templated list', () => {
	const records = [...rowUpdates(4), { hostNodeId: 'h9', graphNodeId: 'state:alone', path: [] }];
	const encoded = encodeRecordTemplates(records) as ProtocolTemplatedRecords;
	expect(encoded.r.at(-1)).toEqual(records.at(-1));
	expect(roundTrip(records)).toEqual(records);
});

test('payload scripts serve templated lists and decode back to the same payloads', () => {
	const state: ProtocolStatePayload = {
		version: 1,
		cells: [],
		computed: Array.from({ length: 20 }, (_, row) => ({
			graphNodeId: `c0:p${row}:computed:rowState`,
			name: 'rowState',
			async: false,
			deriveSymbolId: `bound:symbol%3A20:component-edge%3A${row}`,
			dependencies: [
				{ graphNodeId: 'computed:rows', path: [] },
				{ graphNodeId: `c0:p${row}:prop:props`, path: ['slot'] },
			],
		})),
	};
	const view: ProtocolViewPayload = {
		version: 1,
		locators: [],
		events: [],
		domUpdates: rowUpdates(20) as ProtocolViewPayload['domUpdates'],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
	const scripts = renderPayloadScripts({ state, view }, encodeProtocolPayloadLists);
	expect(scripts.stateScript).toContain('"computed":{"t":[');
	expect(scripts.viewScript).toContain('"domUpdates":{"t":[');
	expect(scripts.stateScript.length).toBeLessThan(JSON.stringify(state).length / 3);
	expect(decodePayloadScripts(scripts)).toEqual({ state, view });
});

test('a payload already served as plain arrays decodes unchanged', () => {
	const view = { version: 1, domUpdates: rowUpdates(2) };
	expect(decodeProtocolPayloadLists('markless/view', structuredClone(view))).toEqual(view);
	expect(PROTOCOL_TEMPLATED_LISTS['markless/view']).toContain('domUpdates');
});
