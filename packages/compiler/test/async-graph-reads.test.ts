import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (source: string) =>
	compileTsrxModule({ filename: 'pages/reads.tsrx', source, symbols: [] });

test('an optional member read of an async value renders from the graph like a plain one', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
export default function Reads() @{
	const order = computed(async () => ({ total: 3 }));
	<section>
		@try {
			<>
				<b>{order?.total}</b>
				<i>{JSON.stringify(order)}</i>
			</>
		} @pending {
			<p>waiting</p>
		}
	</section>
}`);
	expect(result.publicRenderPlan.diagnostics ?? []).toEqual([]);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const residues = result.renderData.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) => ('residue' in slot ? [slot.residue] : [])),
	);
	expect(residues).toContainEqual({
		kind: 'graph-read',
		graphNodeId: 'computed:order',
		path: ['total'],
	});
});

test('the server runner of an async value reads a page-scoped shared field from the render state', async () => {
	const result = await compile(`
import { computed, shared, state } from '@markless/core';
const settings = shared(() => {
	const prefs = state({ page: 1 });
	return { ...prefs };
}, { scope: 'page' });
export default function Reads() @{
	const s = settings();
	const rows = computed(async () => ({ page: s.page }));
	<section>
		@try {
			<p>{rows.page}</p>
		} @catch (error) {
			<p>{String(error)}</p>
		}
	</section>
}`);
	const ssr = result.publicRenderModule?.ssrModuleSource ?? '';
	expect(ssr).toContain(
		'const s=marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("shared:pages/reads.tsrx#settings/state:prefs"),[]);',
	);
});

test('an optional member read of a state cell keeps its text current', async () => {
	const result = await compile(`
import { state } from '@markless/core';
export default function Reads() @{
	let cart = state({ count: 1 });
	<section>
		<button onClick={() => (cart = { count: cart.count + 1 })}>add</button>
		<b>{cart?.count}</b>
	</section>
}`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(
		result.payloadArena.view.domUpdates.map((update) => [update.graphNodeId, update.path]),
	).toEqual([['state:cart', ['count']]]);
});
