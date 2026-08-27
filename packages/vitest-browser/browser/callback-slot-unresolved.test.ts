import { marklessInvokeCallbackSlot } from '@markless/web/fns/callback-slot';
import { expect, test } from 'vitest';

// An empty slot has two readings and only one is a framework gap: a consumer who
// passed no callback leaves a rendered instance with an empty cell, while an id
// that resolved onto no instance means the dispatch could never reach anybody.
// Left equal, the second is invisible - the handler runs to its end and the
// consumer is simply never told.
const SLOT_NODE_ID = 'shared:src/box.tsrx#boxState/slot:onChange';

function graphOf(definitionIds: ReadonlyArray<string>) {
	const definitions = definitionIds.map((id) => ({ id, scope: 'widget' }));
	return {
		read: () => undefined,
		listSharedDefinitions: () => definitions,
		getSharedDefinition: (id: string) => definitions.find((entry) => entry.id === id),
	} as never;
}

test('a dispatch whose slot reached no rendered widget is refused', () => {
	expect(() =>
		marklessInvokeCallbackSlot(
			{ graph: graphOf(['c0:shared:src/other.tsrx#otherState']) },
			SLOT_NODE_ID,
			[true],
			'c0:',
		),
	).toThrow(/MARKLESS_CALLBACK_SLOT_UNRESOLVED/);
});

test('a rendered widget whose consumer passed no callback stays a no-op', () => {
	expect(
		marklessInvokeCallbackSlot(
			{ graph: graphOf(['c0:shared:src/box.tsrx#boxState']) },
			SLOT_NODE_ID,
			[true],
			'c0:',
		),
	).toBeUndefined();
});
