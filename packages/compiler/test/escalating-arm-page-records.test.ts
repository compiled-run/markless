import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// An arm holding a component with state of its own renders whole on every flip,
// so the page's own records inside it ride the flat streams that render emits;
// an arm with no such component keeps them in its per-arm record sets.
async function compileArm(arm: string) {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
function Counter() @{
	let hits = state(0);
	<em onClick={() => hits++}>{hits}</em>
}
function Label() @{
	<small>label</small>
}
export default function Page() @{
	let visible = state(false);
	let total = state(0);
	<section>
		<button onClick={() => visible = !visible}>toggle</button>
		@if (visible) {
			${arm}
		}
	</section>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const flatReads = result.protocolView.domUpdates.map((update) => update.graphNodeId);
	const flatEvents = result.protocolView.events.length;
	return { branch: result.protocolView.branches?.[0], flatReads, flatEvents };
}

test('page text and handlers beside a stateful component stay in the flat streams', async () => {
	const { branch, flatReads, flatEvents } = await compileArm(
		'<Counter />\n\t\t\t<p>{total}</p>\n\t\t\t<a onClick={() => total++}>add</a>',
	);
	expect(branch?.escalates).toBe(true);
	expect(flatReads).toContain('state:total');
	// toggle, the component's own handler, and the page handler inside the arm
	expect(flatEvents).toBe(3);
});

test('the same arm without a stateful component keeps its records per arm', async () => {
	const { branch, flatReads, flatEvents } = await compileArm(
		'<Label />\n\t\t\t<p>{total}</p>\n\t\t\t<a onClick={() => total++}>add</a>',
	);
	expect(branch?.escalates).toBeUndefined();
	expect(flatReads).not.toContain('state:total');
	expect(flatEvents).toBe(2);
	expect(
		(branch as { armRecords?: Array<{ domUpdates: Array<{ graphNodeId: string }> }> })
			.armRecords?.[0]?.domUpdates.map((update) => update.graphNodeId),
	).toContain('state:total');
});
