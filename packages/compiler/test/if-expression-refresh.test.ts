import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// Defect 30: an @if whose condition recombines reads - `value === 'b'`, `!open`,
// `label.includes('lit')` - resolved to no graph node, so its flip symbol carried
// an empty wake set and the arm rendered once and then froze while the plain-read
// and computed-gated arms beside it moved on the same write. The branch-condition
// position now mints the same synthetic computed the attribute and prop positions
// mint, so the site tests one graph node exactly as `@if (someComputed)` does.

const localState = `
import { computed, state } from '@markless/core';

export function App() @{
	let value = state('a');
	let open = state(false);
	let label = state('dark');
	const isB = computed(() => value === 'b');

	<main>
		<button type="button" onClick={() => value = 'b'}>go</button>
		@if (open) { <p data-bare>bare</p> }
		@if (isB) { <p data-computed>computed</p> }
		@if (value === 'b') { <p data-comparison>comparison</p> }
		@if (!open) { <p data-negation>negation</p> }
		@if (label.includes('lit')) { <p data-method>method</p> }
	</main>
}
`;

const propsOnly = `
export function App({ left, right }) @{
	<main>
		@if (left === right) { <p data-same>same</p> }
	</main>
}
`;

const sharedInstance = `
import { shared, state } from '@markless/core';

export const picker = shared(() => {
	const cell = state({ value: 'a', open: false });

	return { ...cell };
}, { scope: 'widget' });

export function Panel() @{
	const p = picker();

	<section>
		@if (p.open) { <p data-bare>bare</p> }
		@if (p.value === 'b') { <p data-comparison>comparison</p> }
	</section>
}
`;

// The same shape with the part's local named after the factory's state variable,
// which is what every shipped family writes (`const checkbox = checkboxState()`).
const sharedInstanceNameMatch = `
import { shared, state } from '@markless/core';

export const pickerState = shared(() => {
	const picker = state({ value: 'a', open: false });

	return { ...picker };
}, { scope: 'widget' });

export function Panel() @{
	const picker = pickerState();

	<section>
		@if (picker.open) { <p data-bare>bare</p> }
		@if (picker.value === 'b') { <p data-comparison>comparison</p> }
	</section>
}
`;

async function branchFacts(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	const bindingsById = new Map(
		semanticGraph.graphBindings.map((binding) => [binding.id, binding] as const),
	);
	const branches = symbolResolver.symbols.flatMap((symbol) =>
		symbol.kind === 'branch-update'
			? [
					{
						branchSiteId: symbol.branchSiteId,
						testSource: symbol.testSource,
						wakeSet: symbol.testReads.map((read) => read.graphNodeId),
						// What a write has to move for this arm to be rebuilt.
						roots: symbol.testReads.flatMap((read) =>
							(bindingsById.get(read.graphNodeId)?.dependencies ?? []).map(
								(dependency) => dependency.graphNodeId,
							),
						),
					},
				]
			: [],
	);
	return { semanticGraph, branches };
}

test('a recombined @if condition joins a synthetic computed over the reads inside it', async () => {
	const { branches } = await branchFacts('local.tsrx', localState);
	const wakeRoots = branches.map((branch) => branch.roots);

	// branch-site:2 is `value === 'b'`, :3 is `!open`, :4 is `label.includes('lit')`.
	expect(branches[2]?.wakeSet).toEqual(['computed:templateExpression:0']);
	expect(wakeRoots[2]).toEqual(['state:value']);
	expect(branches[3]?.wakeSet).toEqual(['computed:templateExpression:1']);
	expect(wakeRoots[3]).toEqual(['state:open']);
	expect(branches[4]?.wakeSet).toEqual(['computed:templateExpression:2']);
	expect(wakeRoots[4]).toEqual(['state:label']);
});

test('the bare-read and computed arms keep the graph node they already had', async () => {
	const { branches } = await branchFacts('local.tsrx', localState);

	expect(branches[0]?.wakeSet).toEqual(['state:open']);
	expect(branches[1]?.wakeSet).toEqual(['computed:isB']);
	// The controls mint nothing: only the three recombined conditions do.
	const { semanticGraph } = await branchFacts('local.tsrx', localState);
	expect(
		semanticGraph.graphBindings.filter((binding) =>
			binding.id.startsWith('computed:templateExpression:'),
		),
	).toHaveLength(3);
});

test('a condition over props alone mints nothing', async () => {
	// No write can move a prop after the render that read it, so the byte cost of a
	// computed buys no behavior here; the site keeps the empty wake set it had.
	const { semanticGraph, branches } = await branchFacts('props.tsrx', propsOnly);

	expect(
		semanticGraph.graphBindings.filter((binding) =>
			binding.id.startsWith('computed:templateExpression:'),
		),
	).toHaveLength(0);
	expect(branches[0]?.wakeSet).toEqual([]);
});

test('a recombined condition over a shared instance reaches the instance state', async () => {
	const { branches } = await branchFacts('shared.tsrx', sharedInstance);

	// A BARE read of a shared instance still has no wake set here: the branch
	// position resolves its test through graph bindings and aliases only, and a
	// part local holding an instance is neither. The recombined read does resolve,
	// because the composite collector falls back to the shared-instance resolver
	// that the branch position never calls.
	expect(branches[0]?.wakeSet).toEqual([]);
	expect(branches[1]?.wakeSet).toEqual(['computed:templateExpression:0']);
	expect(branches[1]?.roots).toEqual(['shared:shared.tsrx#picker/state:cell']);
});

test('a bare shared read only resolves when the part local repeats the factory name', async () => {
	// Why the shipped families never saw the bare-read half of this freeze: they
	// all write `const checkbox = checkboxState()`, and the factory's own state
	// variable is called `checkbox` too, so the branch test resolves by name
	// coincidence rather than by knowing what the local holds. Rename either side
	// and the same arm freezes - the case above. Closing that gap means teaching
	// the branch position the shared-instance resolver, outside this change.
	const { branches } = await branchFacts('match.tsrx', sharedInstanceNameMatch);

	expect(branches[0]?.wakeSet).toEqual(['shared:match.tsrx#pickerState/state:picker']);
	expect(branches[1]?.wakeSet).toEqual(['computed:templateExpression:0']);
});
