import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// Defect 30: an @if whose condition recombines reads - `value === 'b'`, `!open`,
// `label.includes('lit')` - resolved to no graph node, so its flip symbol carried
// an empty wake set and the arm rendered once and then froze while the plain-read
// and computed-gated arms beside it moved on the same write. The branch-condition
// position now mints the same synthetic computed the attribute and prop positions
// mint, so the site tests one graph node exactly as `@if (someComputed)` does.
//
// Defect 34: the BARE half of the same freeze. `@if (p.open)` over a shared
// instance resolved through the module's binding names, which answer a part local
// only when it happens to repeat the factory's own state variable name, so the
// arm worked in the families that spell it that way and froze silently anywhere
// else. The branch position now asks the shared-instance resolver first.

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
						// The node alone is not the read: a shared instance field is one
						// path into a cell the whole widget shares.
						reads: symbol.testReads.map((read) => [read.graphNodeId, read.path]),
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

// The browser fixture's three recombined shapes in one module: a condition that
// starts FALSE, one that starts TRUE, and one over two fields of a shared
// instance. What the client needs from the compiler for each is the same three
// facts, so they are pinned together below.
const wiringShapes = `
import { shared, state } from '@markless/core';

export const row = shared(() => {
	const cell = state({ value: 'a', own: 'b' });

	return {
		...cell,
		pick() {
			cell.value = cell.value === 'b' ? 'a' : 'b';
		},
	};
}, { scope: 'widget' });

export default function Page() @{
	let value = state('a');
	let hidden = state(true);

	<div data-page>
		<button type="button" data-toggle onClick={() => { value = value === 'b' ? 'a' : 'b'; hidden = !hidden; }}>flip</button>
		@if (value === 'b') { <p data-comparison>c</p> }
		@if (value !== 'b') { <p data-initially-true>t</p> }
		<Row />
	</div>
}

export function Row() @{
	const r = row();

	<span data-row>
		<button type="button" data-row-toggle onClick={() => r.pick()}>pick</button>
		@if (r.value === r.own) { <b data-cross>cross</b> }
	</span>
}
`;

test('the payload carries each branch-condition computed the client has to read', async () => {
	const compiled = await compileTsrxModule({
		filename: 'fixture.tsrx',
		source: wiringShapes,
		buildId: 'b',
		resolverId: 'r',
		symbols: [],
	});

	// Every site tests exactly one node, and it is the minted computed.
	expect(
		compiled.protocolView.branches?.map((branch) => [
			branch.id,
			branch.testReads.map((read) => read.graphNodeId),
		]),
	).toEqual([
		['branch-site:0', ['computed:templateExpression:0']],
		['branch-site:1', ['computed:templateExpression:1']],
		['branch-site:2', ['computed:templateExpression:2']],
	]);

	// And each of those nodes ships with the dependencies that wake it and the
	// derive the client re-runs, including the shared-instance one whose two
	// reads land on the same cell by different paths.
	expect(
		compiled.protocolState.computed.map((node) => ({
			graphNodeId: node.graphNodeId,
			dependencies: node.dependencies?.map((dependency) => [
				dependency.graphNodeId,
				dependency.path,
			]),
			hasDerive: node.deriveSymbolId !== undefined,
		})),
	).toEqual([
		{
			graphNodeId: 'computed:templateExpression:0',
			dependencies: [['state:value', []]],
			hasDerive: true,
		},
		{
			graphNodeId: 'computed:templateExpression:1',
			dependencies: [['state:value', []]],
			hasDerive: true,
		},
		{
			graphNodeId: 'computed:templateExpression:2',
			dependencies: [
				['shared:fixture.tsrx#row/state:cell', ['value']],
				['shared:fixture.tsrx#row/state:cell', ['own']],
			],
			hasDerive: true,
		},
	]);
});

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

test('a condition over a shared instance reaches the instance state, bare or recombined', async () => {
	const { branches } = await branchFacts('shared.tsrx', sharedInstance);

	// Defect 34: a BARE read reached no node here, because the branch position
	// resolved its test through graph bindings and aliases only and a part local
	// holding an instance is neither - so `p.open` froze while `p.value === 'b'`
	// two lines down moved, the recombined one having gone through the composite
	// collector's shared-instance fallback. Both spellings now land on the cell.
	expect(branches[0]?.reads).toEqual([['shared:shared.tsrx#picker/state:cell', ['open']]]);
	expect(branches[1]?.wakeSet).toEqual(['computed:templateExpression:0']);
	expect(branches[1]?.roots).toEqual(['shared:shared.tsrx#picker/state:cell']);
});

const shippedFamilyShape = `
import { shared, state } from '@markless/core';

export const checkboxState = shared(() => {
	const checkbox = state({ checked: false, disabled: false });

	return {
		...checkbox,
		toggle() {
			checkbox.checked = !checkbox.checked;
		},
	};
}, { scope: 'widget' });

export function CheckboxIndicator() @{
	const checkbox = checkboxState();

	<span data-indicator>
		<button type="button" onClick={() => checkbox.toggle()}>t</button>
		@if (checkbox.checked) { <b data-on>on</b> } @else { <i data-off>off</i> }
	</span>
}
`;

test('a bare shared read resolves the same way whichever name the part local has', async () => {
	// The shipped families all write `const checkbox = checkboxState()`, and the
	// factory's own state variable is called `checkbox` too, so this arm used to
	// resolve by name coincidence. It now resolves because the branch position asks
	// the shared-instance resolver what the local holds, and the node and path it
	// answers with are the ones the coincidence produced.
	const { branches } = await branchFacts('match.tsrx', sharedInstanceNameMatch);

	expect(branches[0]?.wakeSet).toEqual(['shared:match.tsrx#pickerState/state:picker']);
	expect(branches[1]?.wakeSet).toEqual(['computed:templateExpression:0']);
});

test('the shipped-family arm keeps the branch record it already emitted', async () => {
	// The canary for defect 34's fix: every family ships `@if (checkbox.checked)`
	// over a same-named part local. Compiling this module before and after the
	// resolver change produced byte-identical output across every artifact; this
	// pins the record that carries the arm, so a later change to the branch
	// position cannot move it without saying so here.
	const compiled = await compileTsrxModule({
		filename: 'Checkbox.tsrx',
		source: shippedFamilyShape,
		buildId: 'b',
		resolverId: 'r',
		symbols: [],
	});

	expect(compiled.protocolView.branches?.map((branch) => [branch.id, branch.testReads])).toEqual([
		[
			'branch-site:0',
			[
				{
					source: 'checkbox.checked',
					graphNodeId: 'shared:Checkbox.tsrx#checkboxState/state:checkbox',
					path: ['checked'],
				},
			],
		],
	]);
	// A bare read is still a bare read: nothing new is minted to carry it.
	expect(
		compiled.semanticGraph.graphBindings.filter((binding) =>
			binding.id.startsWith('computed:templateExpression:'),
		),
	).toHaveLength(0);
});
