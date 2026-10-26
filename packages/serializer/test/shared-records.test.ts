import { expect, test } from 'vitest';
import { renderPayloadScripts } from '../src/payload-scripts.ts';
import { decodePayloadScripts } from '../src/protocol-client.ts';
import { encodeProtocolPayloadLists } from '../src/protocol-record-templates-encode.ts';
import { decodeProtocolPayloadLists } from '../src/protocol-record-templates.ts';
import { shareStateRecords } from '../src/protocol-shared-records.ts';
import { createProtocolStatePayload } from '../src/protocol-state.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '../src/protocol.ts';
import {
	deserializeGraphValue,
	serializeGraphValue,
	type SerializedGraphPayload,
} from '../src/value.ts';

type Tree = { readonly id: number; readonly label: string; readonly kids: readonly Tree[] };

// Letters, not digits: a served digit run is a template value, so a numbered label never appears whole.
const letters = (id: number): string =>
	(id >= 26 ? letters(Math.floor(id / 26) - 1) : '') + String.fromCharCode(97 + (id % 26));

function tree(depth: number, next = { id: 0 }): Tree {
	const id = next.id++;
	return {
		id,
		label: `node ${letters(id)}`,
		kids: depth ? [tree(depth - 1, next), tree(depth - 1, next)] : [],
	};
}

function nodes(root: Tree): Tree[] {
	return [root, ...root.kids.flatMap(nodes)];
}

// What a self-rendering row component serves: each instance's prop cell holds its own subtree.
function rowCells(root: Tree) {
	return nodes(root).map((node) => ({
		graphNodeId: `c${node.id}:prop:props`,
		name: 'props',
		valueKind: 'object' as const,
		value: { kids: node.kids },
	}));
}

const viewPayload: ProtocolViewPayload = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

// A served state script, parsed the way a browser reads it.
function served(state: ProtocolStatePayload): ProtocolStatePayload {
	const scripts = renderPayloadScripts({ state, view: viewPayload }, encodeProtocolPayloadLists);
	return decodePayloadScripts({ stateScript: scripts.stateScript, viewScript: scripts.viewScript }).state;
}

const decoded = (state: ProtocolStatePayload) =>
	state.cells.map((cell) => deserializeGraphValue(cell.value as SerializedGraphPayload));

test('a subtree every level holds again is served once and decodes into every cell', () => {
	const root = tree(6);
	const state = createProtocolStatePayload({ cells: rowCells(root) });
	const script = renderPayloadScripts(
		{ state, view: viewPayload },
		encodeProtocolPayloadLists,
	).stateScript;
	for (const id of [3, 40, 126]) expect(script.split(`"node ${letters(id)}"`)).toHaveLength(2);
	expect(script.length).toBeLessThan(JSON.stringify(state).length / 2.5);
	expect(decoded(served(state))).toEqual(decoded(state));
});

test('served bytes grow with the tree, not with the tree times its depth', () => {
	const bytes = (depth: number) =>
		renderPayloadScripts(
			{ state: createProtocolStatePayload({ cells: rowCells(tree(depth)) }), view: viewPayload },
			encodeProtocolPayloadLists,
		).stateScript.length / (2 ** (depth + 1) - 1);
	expect(bytes(9) / bytes(4)).toBeLessThan(1.15);
});

test('cycles, a value held twice in one cell, maps, sets and dates round-trip exactly', () => {
	const shared = { when: new Date(0), tags: new Set(['a', 'b']) };
	const loop: Record<string, unknown> = { name: 'loop' };
	loop.self = loop;
	const lookup = new Map<string, unknown>([['x', shared]]);
	const values = [
		{ first: shared, again: shared, lookup },
		{ shared, lookup, loop },
		{ loop, list: [shared, shared] },
		[1, 'two', null],
	];
	const state = createProtocolStatePayload({
		cells: values.map((value, at) => ({
			graphNodeId: `cell:${at}`,
			name: `cell${at}`,
			valueKind: 'object' as const,
			value,
		})),
	});
	const back = decoded(served(state));
	expect(back).toEqual(decoded(state));
	const [first] = back as [{ first: unknown; again: unknown }];
	expect(first.first).toBe(first.again);
	const third = back[2] as { loop: { self: unknown } };
	expect(third.loop.self).toBe(third.loop);
});

test('equal objects stay distinct objects and one object held twice stays one', () => {
	const twin = () => ({ n: 1, tags: [] as string[] });
	const held = twin();
	const values = [
		{ left: twin(), right: twin(), again: [held, held] },
		{ only: twin(), list: [twin(), twin()] },
		{ another: twin() },
	];
	const state = createProtocolStatePayload({
		cells: values.map((value, at) => ({
			graphNodeId: `cell:${at}`,
			name: `cell${at}`,
			valueKind: 'object' as const,
			value,
		})),
	});
	const script = renderPayloadScripts({ state, view: viewPayload }, encodeProtocolPayloadLists)
		.stateScript;
	expect(script).toContain('"sharedRecords"');
	const [first, second] = decoded(served(state)) as [
		{ left: object; right: object; again: [object, object] },
		{ only: object; list: [object, object] },
	];
	expect(first).toEqual(values[0]);
	expect(first.left).not.toBe(first.right);
	expect(first.again[0]).toBe(first.again[1]);
	expect(second.list[0]).not.toBe(second.list[1]);
});

test('served computed values and settled snapshots share records with cells', () => {
	const root = tree(4);
	const envelope = (value: unknown) => {
		const result = serializeGraphValue(value);
		if (!result.ok) throw new Error('unserializable');
		return result.payload;
	};
	const state = {
		...createProtocolStatePayload({ cells: rowCells(root) }),
		computed: [
			{ graphNodeId: 'computed:item', name: 'item', async: false, value: envelope(root) },
			{
				graphNodeId: 'computed:story',
				name: 'story',
				async: true,
				snapshot: { status: 'fulfilled', version: 1, key: envelope(['story', 1]), value: envelope(root) },
			},
		],
	} as unknown as ProtocolStatePayload;
	const back = served(state);
	expect(decoded(back)).toEqual(decoded(state));
	const value = (entry: unknown) => deserializeGraphValue(entry as SerializedGraphPayload);
	expect(value(back.computed[0]!.value)).toEqual(root);
	const snapshot = back.computed[1]!.snapshot as { key: unknown; value: unknown };
	expect(value(snapshot.value)).toEqual(root);
	expect(value(snapshot.key)).toEqual(['story', 1]);
});

test('sharing leaves the payload it was handed untouched', () => {
	const state = createProtocolStatePayload({ cells: rowCells(tree(3)) });
	const before = JSON.stringify(state);
	const shared = shareStateRecords(state);
	expect(shared).not.toBe(state);
	expect(JSON.stringify(state)).toBe(before);
});

test('a payload whose cells share nothing is served as it was', () => {
	const state = createProtocolStatePayload({
		cells: [
			{ graphNodeId: 'a', name: 'a', valueKind: 'object', value: { one: [1] } },
			{ graphNodeId: 'b', name: 'b', valueKind: 'object', value: { two: [2] } },
			{ graphNodeId: 'c', name: 'c', valueKind: 'scalar', value: 3 },
		],
	});
	expect(shareStateRecords(state)).toBe(state);
	const parsed = JSON.parse(JSON.stringify(state));
	expect(decodeProtocolPayloadLists('markless/state', parsed)).toEqual(state);
});
