import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { protocolInstanceSegment } from '../../serializer/src/protocol.ts';
import { marklessInvokeCallbackSlot } from '../src/fns/callback-slot.ts';
import { marklessInstanceScopedGraph } from '../src/fns/instance-scope.ts';

// A widget composed inside another widget is reached through chained scope
// adapters: the innermost adapter's own instance path is a partial answer, and
// only the composed qualifier says which node a read really lands on. The
// unresolved-slot refusal has to ask the same question the read asked, or it
// accuses a widget the page did render.
const BOX_DEFINITION = 'shared:src/box.tsrx#boxState';
const SLOT_NODE_ID = `${BOX_DEFINITION}/slot:onChange`;
const c0 = protocolInstanceSegment(0);
const c1 = protocolInstanceSegment(1);

function pageGraphOf(definitionIds: ReadonlyArray<string>) {
	const definitions = definitionIds.map((id) => ({ id, scope: 'widget' }));
	return {
		read: () => undefined,
		listSharedDefinitions: () => definitions,
		getSharedDefinition: (id: string) => definitions.find((entry) => entry.id === id),
	} as unknown as RuntimeGraph;
}

// The outer adapter resolves the composed root; the inner one names a
// projection site the registry never heard of, so its path alone resolves
// nothing.
function chainedScope(page: RuntimeGraph) {
	return marklessInstanceScopedGraph(marklessInstanceScopedGraph(page, c0 + c0), c1);
}

test('a slot reached through chained scope adapters resolves its rendered widget', () => {
	const graph = chainedScope(pageGraphOf([c0 + c0 + BOX_DEFINITION]));
	expect(marklessInvokeCallbackSlot({ graph }, SLOT_NODE_ID, [true])).toBeUndefined();
});

test('a slot whose composed id still names no rendered widget is refused', () => {
	const graph = chainedScope(pageGraphOf([`${c0}${c0}shared:src/other.tsrx#otherState`]));
	expect(() => marklessInvokeCallbackSlot({ graph }, SLOT_NODE_ID, [true])).toThrow(
		/MARKLESS_CALLBACK_SLOT_UNRESOLVED/,
	);
});
