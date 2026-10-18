import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const source = `import { computed, state } from '@markless/core';
function Leaf({ label }: { readonly label: string }) @{
	const loud = computed(() => label + '!');
	<b>{loud}</b>
}
function Middle({ label }: { readonly label: string }) @{
	<section><Leaf label={label} /></section>
}
export default function Page() @{
	let word = state('a');
	const upper = computed(() => word.toUpperCase());
	<main><button onClick={() => (word = word + 'a')}>more</button><Middle label={upper} /></main>
}`;

test('a prop forwarded through a same-module component routes to the page node, unqualified', async () => {
	const compiled = await compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] });
	const nested = compiled.boundSymbolResolver.rows.find(
		(row) => row.componentEdgePath.length === 2,
	);
	expect(nested?.captureSlots.map((slot) => slot.route)).toEqual([
		expect.objectContaining({
			kind: 'graph-reference',
			graphNodeId: 'computed:upper',
			path: [],
		}),
	]);
	expect(JSON.stringify(nested)).not.toContain('ownerEdgeCount');
	// The middle component hands its child its own prop, which the page composes onto its node.
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'"graphProps":[{"name":"label","graphNodeId":"prop:props","path":["label"]}]',
	);
});
