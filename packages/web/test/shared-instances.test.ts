import { createRuntimeGraph, type RuntimeGraph } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import { expect, test } from 'vitest';
import { bindSharedCells, reconcileSharedCells } from '../src/fns/shared-instances.ts';

// Two containers on one document bound to one shared() instance, without a DOM: the graph is the container.

const id = 'shared:lib/pick.tsrx#pick';
const cell = `${id}/state:p`;
const state = {
	version: 1,
	cells: [],
	computed: [],
	sharedDefinitions: [
		{ id, name: 'pick', exportedName: 'pick', version: 0, graphNodeIds: [cell], returnProperties: [] },
	],
} as unknown as ProtocolStatePayload;

function mount(document: object, value: unknown): RuntimeGraph {
	const root = { ownerDocument: document, isConnected: true, __mL: {} };
	const bound = bindSharedCells(root, state, [{ graphNodeId: cell, value }]);
	const graph = createRuntimeGraph({ cells: bound.cells, sharedDefinitions: state.sharedDefinitions });
	bound.connect(graph);
	reconcileSharedCells(graph);
	return graph;
}

const settle = async (...graphs: RuntimeGraph[]) => {
	for (let pass = 0; pass < 4; pass++) for (const graph of graphs) await graph.flush();
};

test('a write in one container reaches the other', async () => {
	const document = {};
	const first = mount(document, { value: 'cli' });
	const second = mount(document, { value: 'cli' });
	first.write({ graphNodeId: cell, path: ['value'], value: 'manual' });
	await settle(first, second);
	expect(second.read(cell, ['value'])).toBe('manual');
});

test('two containers that write in one task end on the later write', async () => {
	const document = {};
	const first = mount(document, { value: 'cli' });
	const second = mount(document, { value: 'cli' });
	first.write({ graphNodeId: cell, path: ['value'], value: 'manual' });
	second.write({ graphNodeId: cell, path: ['value'], value: 'auto' });
	await settle(first, second);
	expect([first.read(cell, ['value']), second.read(cell, ['value'])]).toEqual(['auto', 'auto']);
});

test('a cyclic value binds, publishes and compares without overflowing', async () => {
	const document = {};
	const cyclic = (name: string) => {
		const value: Record<string, unknown> = { name };
		value.self = value;
		return value;
	};
	const first = mount(document, cyclic('a'));
	const second = mount(document, cyclic('a'));
	first.write({ graphNodeId: cell, path: ['name'], value: 'b' });
	await settle(first, second);
	const shown = second.read(cell, []) as { name: string; self: unknown };
	expect(shown.name).toBe('b');
	expect(shown.self).toBe(shown);
});

test('a container mounted after a write starts from the live value', async () => {
	const document = {};
	const first = mount(document, { value: 'cli' });
	first.write({ graphNodeId: cell, path: ['value'], value: 'manual' });
	await settle(first);
	expect(mount(document, { value: 'cli' }).read(cell, ['value'])).toBe('manual');
});
