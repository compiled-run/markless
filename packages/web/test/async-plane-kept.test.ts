import { expect, test } from 'vitest';
import { installMarklessAsyncPlane } from '../src/fns/async-plane.ts';
import { asyncPlanes } from '../src/reconcile-plane-slot.ts';
import type { RuntimeGraph } from '@markless/runtime';

installMarklessAsyncPlane();

// A re-run keeps the answer its last run gave, even an answer that resolved to undefined.
const rerun = { status: 'pending', version: 2, key: ['b'], value: undefined, valueKey: ['a'] };
const first = { status: 'pending', version: 1, key: ['a'] };
const reads = (snapshot: unknown) => (graphNodeId: string) => (graphNodeId === 'computed:board' ? snapshot : undefined);
const state = {
	computed: [
		{ graphNodeId: 'computed:board', async: true },
		{ graphNodeId: 'computed:title', asyncFrom: ['computed:board'], dependencies: [{ graphNodeId: 'computed:board' }] },
	],
} as never;

test('a derive over a re-run reads the kept answer, as the plane and the graph do', () => {
	expect(asyncPlanes.awaits!(state, 'computed:title', reads(rerun) as never)).toBe(false);
	expect(asyncPlanes.awaits!(state, 'computed:title', reads(first) as never)).toBe(true);
});

test('a sync computed over a re-run reads the kept answer', () => {
	const byNode = new Map([['computed:board', [{ graphNodeId: 'computed:board', async: true }]]]);
	const graph = (snapshot: unknown) => ({ read: reads(snapshot) }) as unknown as RuntimeGraph;
	const title = { dependencies: [{ graphNodeId: 'computed:board' }] };
	expect(asyncPlanes.awaitsAncestor!(title, byNode, graph(rerun))).toBe(false);
	expect(asyncPlanes.awaitsAncestor!(title, byNode, graph(first))).toBe(true);
});
