import { expect, test } from 'vitest';
import { marklessEntryMarkEnd, marklessEntryMarkStart } from '../src/fns/async-plane.ts';

// The entry mark is always a user action, so only a body running inside a DOM dispatch may open it.
function graph(order: string[]) {
	const plane = {
		markEntry: (graphNodeId: string) => order.push(`markEntry:${graphNodeId}`),
		endEntry: (graphNodeId: string) => order.push(`endEntry:${graphNodeId}`),
	};
	return { asyncPlane: () => plane } as never;
}

function runBody(context: object, beforeEnd?: () => void) {
	marklessEntryMarkStart(context, ['computed:orders']);
	beforeEnd?.();
	marklessEntryMarkEnd(context, ['computed:orders']);
}

test('a body inside a DOM dispatch opens and closes the entry mark', () => {
	const order: string[] = [];
	runBody({ graph: graph(order), userActionToken: { open: true } });
	expect(order).toEqual(['markEntry:computed:orders', 'endEntry:computed:orders']);
});

test('a body called after its dispatch ended never opens the entry mark', () => {
	const order: string[] = [];
	runBody({ graph: graph(order), userActionToken: { open: false } });
	expect(order).toEqual([]);
});

test('a body with no token never opens the entry mark', () => {
	const order: string[] = [];
	runBody({ graph: graph(order) });
	expect(order).toEqual([]);
});

test('an entry mark opened inside a dispatch still closes after the dispatch ended', () => {
	const order: string[] = [];
	const userActionToken = { open: true };
	runBody({ graph: graph(order), userActionToken }, () => (userActionToken.open = false));
	expect(order).toEqual(['markEntry:computed:orders', 'endEntry:computed:orders']);
});
