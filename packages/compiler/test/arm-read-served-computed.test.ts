import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A flip after resume renders its arm from values read off the resumed graph,
// and a sync computed there holds nothing until a dependency is written. An arm
// closed at render time left its computed text empty on the first open, so a
// computed a flippable arm reads travels in the payload the way a handler's does.

const TEMPLATE_HOLE = `
import { state } from '@markless/core';

export function App() @{
	let open = state(false);
	let taps = state(0);

	<main>
		<button type="button" onClick={() => open = !open}>Open</button>
		<button type="button" onClick={() => taps = taps + 1}>Tap</button>
		@if (open) { <i>{\`chip \${taps}\`}</i> }
	</main>
}
`;

const NAMED_COMPUTED = `
import { computed, state } from '@markless/core';

export function Panel() @{
	let shown = state(true);
	let hits = state(3);
	const label = computed(() => hits * 2);
	const hint = computed(() => hits + 1);

	<section>
		<b onClick={() => shown = !shown}>{hint}</b>
		@if (shown) { <p title={label}>ready</p> }
	</section>
}
`;

async function compile(source: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/Arm.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [
		...compiled.semanticGraph.diagnostics,
		...compiled.stateLowering.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
	expect(errors).toEqual([]);
	return compiled;
}

test('a computed text hole inside a flippable arm is served', async () => {
	const compiled = await compile(TEMPLATE_HOLE);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["computed:templateExpression:0"]);',
	);
});

test('an attribute read in an arm is served, and a computed only served markup reads is not', async () => {
	const source = (await compile(NAMED_COMPUTED)).publicRenderModule.ssrModuleSource ?? '';

	expect(source).toContain(
		'marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues, ["computed:label"]);',
	);
	expect(source.match(/marklessSsrServeComputed\(/g)).toHaveLength(1);
});
