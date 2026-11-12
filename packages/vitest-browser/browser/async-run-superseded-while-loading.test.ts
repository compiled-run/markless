import { expect, test } from 'vitest';
import type { RuntimeGraph } from '@markless/runtime';
import { installMarklessAsyncPlane } from '../../web/src/fns/async-plane.ts';
import { asyncPlanes } from '../../web/src/reconcile-plane-slot.ts';

// A newer run aborts an older one; when the older one's code was still loading, its body must not run with the aborted signal.
test('an async value run superseded while its code loads never runs that code', async () => {
	installMarklessAsyncPlane();
	let release!: () => void;
	const loaded = new Promise<void>((done) => (release = done));
	const ran: unknown[] = [];
	const graph = { read: () => undefined } as unknown as RuntimeGraph;
	const computed = await asyncPlanes.fromRecord!(
		{ graphNodeId: 'computed:matches', name: 'matches', async: true, dependencies: [{ graphNodeId: 'state:query', path: [] }] },
		'symbol:matches',
		{
			root: document.body,
			loadSymbol: async () => {
				await loaded;
				return ((input: { readonly key: unknown }) => ran.push(input.key)) as never;
			},
		},
		() => graph,
	);
	const controller = new AbortController();
	const run = Promise.resolve(computed.run({ key: 'b', signal: controller.signal, read: graph.read }));
	controller.abort();
	release();
	await expect(run).rejects.toBe(controller.signal.reason);
	expect(ran).toEqual([]);
});
