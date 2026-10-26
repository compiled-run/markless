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
	encodeStreamedArmRecords,
} from '../src/protocol-record-templates-encode.ts';
import { decodePayloadScripts } from '../src/protocol-client.ts';
import { decodeStreamedArmPatch } from '../src/protocol-streamed-arm-decode.ts';
import { renderPayloadScripts } from '../src/payload-scripts.ts';
import { PROTOCOL_RECORD_KEYS } from '../src/protocol-record-keys.ts';
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

test('field names the key table spells travel as indexes, and unknown ones as themselves', () => {
	const keys = PROTOCOL_RECORD_KEYS['markless/view'].domUpdates;
	const records = [
		...rowUpdates(3),
		{ hostNodeId: 'h1', graphNodeId: 'state:x', path: [], hostPath: [0], '~odd^': 1 },
	];
	const encoded = encodeRecordTemplates(records, keys) as ProtocolTemplatedRecords;
	const wire = JSON.stringify(encoded);
	expect(wire).not.toContain('graphNodeId');
	expect(wire).toContain('hostPath');
	const decoded = expandRecordTemplates(JSON.parse(wire), keys);
	expect(decoded).toEqual(records);
});

test('the key tables are the ones the protocol types generate', async () => {
	const { generateRecordKeysSource, RECORD_KEYS_FILE } = await import(
		'../scripts/generate-record-keys.ts'
	);
	const { readFileSync } = await import('node:fs');
	expect(
		readFileSync(RECORD_KEYS_FILE, 'utf8'),
		'run node packages/serializer/scripts/generate-record-keys.ts',
	).toBe(generateRecordKeysSource());
});

test('a payload already served as plain arrays decodes unchanged', () => {
	const view = { version: 1, domUpdates: rowUpdates(2) };
	expect(decodeProtocolPayloadLists('markless/view', structuredClone(view))).toEqual(view);
	expect(PROTOCOL_TEMPLATED_LISTS['markless/view']).toContain('domUpdates');
});

// One component instance per row of a recursive tree: `c0:` then `r:<key>:c0:` per level.
const chainPath = (keys: ReadonlyArray<string | number>) =>
	`c0:${keys.map((key) => `r:${key}:c0:`).join('')}`;

const rowView = (paths: ReadonlyArray<string>): ProtocolViewPayload => ({
	version: 1,
	locators: paths.flatMap((path, row) => [
		{ hostNodeId: `${path}h1`, strategy: 'dom-order', index: row * 2, tagName: 'span' },
		{ hostNodeId: `${path}h3`, strategy: 'dom-order', index: row * 2 + 1, tagName: 'div' },
	]),
	events: paths.map((path) => ({
		hostNodeId: `${path}h1`,
		eventName: 'click',
		symbolIds: [`${path}symbol:0`],
	})),
	domUpdates: paths.map((path) => ({
		hostNodeId: `${path}h3`,
		source: 'open',
		graphNodeId: `${path}computed:templateExpression:1`,
		path: [],
		target: { kind: 'attribute', name: 'hidden' },
		symbolId: `${path}symbol:3`,
	})),
	behaviors: [],
	elementHandles: [],
	keyedRepeats: paths.map((path) => ({
		id: `${path}repeat:0`,
		parentHostNodeId: `${path}h3`,
		collectionGraphNodeId: `${path}prop:props`,
		collectionPath: ['kids'],
		keyPath: ['id'],
		itemName: 'kid',
		rowElementCount: 0,
		rowComponent: { componentEdgeId: 'component-edge:0', componentName: 'Node' },
		rowEvents: [],
		instancePath: path,
	})),
	asyncBoundaries: [],
});

const servedView = (view: ProtocolViewPayload) =>
	renderPayloadScripts(
		{ state: { version: 1, cells: [], computed: [] }, view },
		encodeProtocolPayloadLists,
	).viewScript;

test('a row nested forty levels deep is served in the bytes of a row one level deep', () => {
	const chain = (depth: number) =>
		Array.from({ length: depth }, (_, at) =>
			chainPath(Array.from({ length: at }, (_, level) => level + 1)),
		);
	const perRow = (depth: number) => servedView(rowView(chain(depth))).length / depth;
	expect(perRow(40) / perRow(4)).toBeLessThan(1.2);
	const view = rowView(chain(12));
	const scripts = renderPayloadScripts(
		{ state: { version: 1, cells: [], computed: [] }, view },
		encodeProtocolPayloadLists,
	);
	expect(decodePayloadScripts(scripts).view).toEqual(view);
});

test('rows of a wide list cost the same bytes each however many rows there are', () => {
	const wide = (rows: number) =>
		Array.from({ length: rows }, (_, row) => chainPath([`item-${row}`]));
	const perRow = (rows: number) => servedView(rowView(wide(rows))).length / rows;
	expect(perRow(400) / perRow(20)).toBeLessThan(1.1);
});

test('an instance path is served once, as its parent entry and the segments it adds', () => {
	const paths = [chainPath([1]), chainPath([1, 2]), chainPath([1, 2, 3]), chainPath([4])];
	const served = JSON.parse(
		servedView(rowView(paths)).slice('<script type="markless/view">'.length, -9),
	);
	expect(served.instancePaths).toEqual([
		'c0:r:1:c0:',
		[0, 'r:2:c0:'],
		[1, 'r:3:c0:'],
		'c0:r:4:c0:',
	]);
	expect(JSON.stringify(served)).not.toContain('r:1:c0:r:2:');
});

test('instance paths round-trip beside values that spell the same text', () => {
	const records = ['r:5:', 'c1:r:%3Aa%60b:c2:', 'r:5:c0:'].flatMap((path, at) => [
		{ hostNodeId: `${path}h1`, graphNodeId: `state:r:5:x${at}`, path: ['`^~', `${path}`] },
		{ hostNodeId: `${path}h1`, graphNodeId: `state:r:5:x${at}`, path: ['`^~', 'r:5:'] },
	]);
	const view = { ...rowView([]), elementHandles: [], domUpdates: records } as never;
	const scripts = renderPayloadScripts(
		{ state: { version: 1, cells: [], computed: [] }, view },
		encodeProtocolPayloadLists,
	);
	expect(scripts.viewScript).toContain('instancePaths');
	expect(decodePayloadScripts(scripts).view).toEqual(view);
});

test('a streamed arm serves its row records as templates and the names its boot listens for', () => {
	const view = rowView(Array.from({ length: 30 }, (_, row) => chainPath([row])));
	const records = {
		locators: view.locators,
		events: view.events,
		domUpdates: view.domUpdates,
		behaviors: [],
		elementHandles: [],
		keyedRepeats: view.keyedRepeats,
	};
	const served = JSON.parse(JSON.stringify(encodeStreamedArmRecords(records)));
	expect(Array.isArray(served.events)).toBe(false);
	expect(served.eventNames).toEqual(['click']);
	expect(JSON.stringify(served).length).toBeLessThan(JSON.stringify(records).length / 4);
	const [, decoded] = decodeStreamedArmPatch([0, served]);
	expect({ ...decoded, eventNames: undefined }).toEqual({ ...records, eventNames: undefined });
});

test('a streamed arm whose event carries a sync policy keeps its events plain for the boot', () => {
	const view = rowView(Array.from({ length: 30 }, (_, row) => chainPath([row])));
	const events = view.events.map((event, at) =>
		at === 3
			? {
					...event,
					syncPolicy: {
						when: { type: 'constant-truthy', value: true },
						actions: ['preventDefault'],
					},
				}
			: event,
	);
	const records = { ...view, events };
	const served = JSON.parse(JSON.stringify(encodeStreamedArmRecords(records)));
	expect(served.events).toEqual(events);
	expect(Array.isArray(served.locators)).toBe(false);
	expect(decodeStreamedArmPatch([0, served])[1]).toEqual(records);
});
