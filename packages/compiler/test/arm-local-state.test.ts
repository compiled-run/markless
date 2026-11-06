import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// Spec 01 "Conditional identity": a state() written directly in an @if or @switch
// arm body is a cell of that arm. It is planned like any cell, and the branch
// record carries its starting value so the flip writes it back each time the arm
// opens. A starting value only the component could compute keeps the refusal.

const panelSource = `
import { state } from '@markless/core';

export default function Panel() @{
	let open = state(false);

	<section>
		<button onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			let draft = state(0);

			<button onClick={() => draft++}>{draft}</button>
		}
	</section>
}
`;

// Same structure, every name and value changed; the arm is the @else and the value an object.
const alternateSource = `
import { state } from '@markless/core';

export function Drawer({ title }: { title: string }) @{
	let pinned = state(true);

	<aside>
		@if (pinned) {
			<h2>{title}</h2>
		} @else {
			const scratch = state({ text: '', edits: 0 });

			<textarea onInput={(event) => { scratch.text = event.currentTarget.value; scratch.edits += 1; }}>{scratch.text}</textarea>
		}
		<button onClick={() => (pinned = !pinned)}>Pin</button>
	</aside>
}
`;

test('a literal-valued state() in an @if arm is an arm-scoped cell with a known starting value', async () => {
	const graph = await buildSemanticGraph({ filename: 'src/Panel.tsrx', source: panelSource });
	expect(graph.diagnostics).toEqual([]);
	expect(graph.graphBindings.find((binding) => binding.id === 'state:draft')).toMatchObject({
		kind: 'state',
		armScope: { branchSiteId: 'branch-site:0', arm: 0 },
		initialValue: 0,
		initialValueKnown: true,
	});
	expect(graph.graphBindings.find((binding) => binding.id === 'state:open')?.armScope).toBeUndefined();
});

test('the branch record carries the arm seed and the flip rebuilds the arm from compiled markup', async () => {
	const result = await compileTsrxModule({ filename: 'src/Panel.tsrx', source: panelSource, symbols: [] });
	expect(result.symbolModules.armEscalationCandidates ?? []).toEqual([]);
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({
			armSeeds: [{ arm: 0, graphNodeId: 'state:draft', value: 0 }],
			testReads: [expect.objectContaining({ graphNodeId: 'state:open' })],
		}),
	);
	expect(result.protocolState.cells.map((cell) => cell.graphNodeId)).toEqual([
		'state:open',
		'state:draft',
	]);
});

test('an @else arm declaring an object-valued state seeds that arm', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Drawer.tsrx',
		source: alternateSource,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.protocolView.branches?.[0]).toEqual(
		expect.objectContaining({
			armSeeds: [{ arm: 1, graphNodeId: 'state:scratch', value: { text: '', edits: 0 } }],
		}),
	);
});

test('a @switch case body declares arm-scoped state the same way', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Mode.tsrx',
		source: `
import { state } from '@markless/core';
export function Mode() @{
	let mode = state('view');
	<div>
		@switch (mode) {
			@case 'edit': {
				let caret = state(0);
				<input value={caret} onInput={(event) => (caret = event.currentTarget.selectionStart ?? 0)} />
			}
			@default: { <p>viewing</p> }
		}
	</div>
}
`,
	});
	expect(graph.diagnostics).toEqual([]);
	expect(graph.graphBindings.find((binding) => binding.id === 'state:caret')).toMatchObject({
		armScope: { branchSiteId: 'branch-site:0', arm: 0 },
		initialValue: 0,
	});
});

test('a starting value the compiler cannot read, or a declaration below the arm body, keeps the refusal', async () => {
	const computedStart = await buildSemanticGraph({
		filename: 'src/Panel.tsrx',
		source: `
import { state } from '@markless/core';
export function Panel() @{
	let open = state(false);
	let count = state(2);
	<section>
		@if (open) {
			let draft = state(count * 2);
			<p>{draft}</p>
		}
	</section>
}
`,
	});
	expect(computedStart.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
	);
	const refusal = computedStart.diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
	);
	expect(refusal?.message).toContain(
		'inside an @if or @switch arm where the compiled arm cannot start it',
	);
	expect(refusal?.suggestions?.[0]?.message).toContain('literal starting value');

	const nestedStatement = await buildSemanticGraph({
		filename: 'src/Panel.tsrx',
		source: `
import { state } from '@markless/core';
export function Panel({ ready }: { ready: boolean }) @{
	let open = state(false);
	<section>
		@if (open) {
			if (ready) {
				let draft = state(0);
			}
			<p>late</p>
		}
	</section>
}
`,
	});
	expect(nestedStatement.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
	);
});

test('computed() in an arm body keeps the branch refusal and its own wording', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Panel.tsrx',
		source: `
import { computed, state } from '@markless/core';
export function Panel() @{
	let open = state(false);
	let count = state(1);
	<section>
		@if (open) {
			const doubled = computed(() => count * 2);
			<p>{doubled}</p>
		}
	</section>
}
`,
	});
	const refusal = graph.diagnostics.find(
		(diagnostic) => diagnostic.code === 'MARKLESS_STATE_CREATION_SITE_UNSTABLE',
	);
	expect(refusal?.message).toContain('computed() creates "doubled" inside an @if or @switch arm');
	expect(refusal?.suggestions?.[0]?.message).toContain('Declare the computed() in the component body');
});

test('a state() in an @if nested in another arm is also seeded by the outer arm, which rebuilds it', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Thread.tsrx',
		source: `
import { state } from '@markless/core';
export function Thread() @{
	let unfolded = state(false);
	let mode = state('reply');
	<ol>
		@if (unfolded) {
			<li>
				@switch (mode) {
					@case 'reply': {
						let words = state('');
						<textarea onInput={(event) => (words = event.currentTarget.value)}>{words}</textarea>
					}
					@default: { <p>read only</p> }
				}
			</li>
		}
	</ol>
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const seeds = (result.protocolView.branches ?? []).map((branch) => branch.armSeeds ?? []);
	expect(seeds).toContainEqual([{ arm: 0, graphNodeId: 'state:words', value: '' }]);
	expect(seeds.filter((armSeeds) => armSeeds.length > 0)).toHaveLength(2);
});
