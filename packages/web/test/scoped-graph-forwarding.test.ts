import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { protocolInstanceSegment, protocolRowSegment } from '../../serializer/src/protocol.ts';
import { protocolIslandSegment } from '../../serializer/src/protocol-constants.ts';
import {
	marklessGraphWidgetRegistry,
	marklessInstanceScopedGraph,
	marklessNoteWidgetRoot,
	marklessRowScopedGraph,
	type MarklessScopedGraph,
} from '../src/fns/instance-scope.ts';

const child = protocolInstanceSegment(2);
const row = protocolRowSegment('pear');
const scope = [{ rowFree: child, withRows: row + child }];
const factories = {
	row: (graph: RuntimeGraph) => marklessRowScopedGraph(graph, scope),
	instance: (graph: RuntimeGraph) => marklessInstanceScopedGraph(graph, protocolIslandSegment(1)),
	rowThenInstance: (graph: RuntimeGraph) => marklessInstanceScopedGraph(marklessRowScopedGraph(graph, scope), protocolIslandSegment(1)),
	instanceThenRow: (graph: RuntimeGraph) => marklessRowScopedGraph(marklessInstanceScopedGraph(graph, protocolIslandSegment(1)), scope),
};

for (const [name, adapt] of Object.entries(factories)) {
	test(`${name} forwards live methods, receivers, arguments and result identities`, () => {
		const calls: Array<{ method: string; receiver: unknown; args: unknown[] }> = [];
		const result = Promise.resolve('result');
		const disposer = () => {};
		const graph = { listSharedDefinitions: () => [] } as unknown as RuntimeGraph;
		for (const method of ['read', 'write', 'update', 'call', 'delete', 'subscribe'] as const) {
			Object.assign(graph, { [method]: function (...args: unknown[]) {
				calls.push({ method, receiver: this, args });
				return method === 'subscribe' ? disposer : result;
			} });
		}
		const adapted = adapt(graph);
		const id = child + 'state:count';
		const expected = (adapted as MarklessScopedGraph).marklessQualifyGraphNodeId!(id);
		const path = ['value'];
		const callback = () => 3;
		const argument = { graphNodeId: id, path, value: { nested: true }, update: callback, callback, extra: 'kept' };
		const inputSnapshot = { ...argument };
		expect(adapted.read(id, path)).toBe(result);
		for (const method of ['write', 'update', 'call', 'delete', 'subscribe'] as const) {
			const invoke = adapted[method] as (input: typeof argument) => unknown;
			expect(invoke(argument)).toBe(method === 'subscribe' ? disposer : result);
		}
		expect(calls.map(call => call.method)).toEqual(['read', 'write', 'update', 'call', 'delete', 'subscribe']);
		for (const call of calls) expect(call.receiver).toBe(graph);
		expect(calls[0]!.args).toEqual([expected, path]);
		expect(calls[0]!.args[1]).toBe(path);
		for (const call of calls.slice(1)) {
			const forwarded = call.args[0] as typeof argument;
			expect(forwarded).toEqual({ ...argument, graphNodeId: expected });
			expect(forwarded).not.toBe(argument);
			expect(forwarded.path).toBe(path);
			expect(forwarded.callback).toBe(callback);
			expect(forwarded.value).toBe(argument.value);
		}
		expect(argument).toEqual(inputSnapshot);
		const token = {};
		graph.read = function () { expect(this).toBe(graph); return token; };
		expect(adapted.read(id)).toBe(token);
		const failure = new Error('original failure');
		graph.read = () => { throw failure; };
		expect(() => adapted.read(id)).toThrow(failure);
	});
}

test('qualifier composition is detached, ordered and evaluated once', () => {
	for (const adapt of [factories.row, factories.instance]) {
		const seen: Array<{ receiver: unknown; id: string }> = [];
		const graph = {
			listSharedDefinitions: () => [],
			marklessQualifyGraphNodeId: function (this: unknown, id: string) {
				seen.push({ receiver: this, id });
				return 'outer:' + id;
			},
		} as unknown as RuntimeGraph;
		const adapted = adapt(graph) as MarklessScopedGraph;
		const id = child + 'state:item';
		const answer = adapted.marklessQualifyGraphNodeId!(id);
		expect(seen).toHaveLength(1);
		expect(seen[0]!.receiver).toBeUndefined();
		expect(answer).toBe('outer:' + seen[0]!.id);
		expect(seen[0]!.id).toBe(adapt === factories.row ? row + id : protocolIslandSegment(1) + id);
	}
});

test('scope identity reuse and distinct islands and rows stay independent', () => {
	const graph = { read: (id: string) => id, listSharedDefinitions: () => [] } as unknown as RuntimeGraph;
	const a = marklessInstanceScopedGraph(graph, protocolIslandSegment(1));
	const b = marklessInstanceScopedGraph(graph, protocolIslandSegment(2));
	expect(marklessInstanceScopedGraph(a, protocolIslandSegment(1))).toBe(a);
	expect(a.read('state:a')).not.toBe(b.read('state:a'));
	const first = marklessRowScopedGraph(graph, scope);
	const second = marklessRowScopedGraph(graph, [{ rowFree: child, withRows: protocolRowSegment('plum') + child }]);
	expect(marklessRowScopedGraph(first, scope)).toBe(first);
	expect(first.read(child + 'state:a')).not.toBe(second.read(child + 'state:a'));
});

test('spread getter order, copied fields and late widget registry roots remain live', () => {
	for (const adapt of [factories.row, factories.instance]) {
		const effects: string[] = [];
		const graph = {
			listSharedDefinitions: () => [],
			get first() { effects.push('first'); return 1; },
			get second() { effects.push('second'); return 2; },
			read: (id: string) => id,
		} as unknown as RuntimeGraph;
		const registry = marklessGraphWidgetRegistry(graph);
		const adapted = adapt(graph);
		expect(effects).toEqual(['first', 'second']);
		expect(Object.getOwnPropertyDescriptor(adapted, 'first')).toEqual({ value: 1, writable: true, enumerable: true, configurable: true });
		expect((adapted as unknown as { second: number }).second).toBe(2);
		const definition = protocolIslandSegment(1) + 'shared:panel';
		marklessNoteWidgetRoot(registry, definition, protocolIslandSegment(1));
		const view = marklessGraphWidgetRegistry(adapted);
		if (adapt === factories.row) expect(view).toBe(registry);
		else expect(view.rootPaths.get('shared:panel')).toBe('');
		expect(registry.rootPaths.get(definition)).toBe(protocolIslandSegment(1));
	}
});
