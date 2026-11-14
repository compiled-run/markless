import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A branch record names, per arm, the instance segments of the components that arm holds and that own a computed, so
// resume can stop their values once the arm no longer shows.

const compile = async (source: string) => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
	return result;
};
const armComponents = (result: Awaited<ReturnType<typeof compile>>) =>
	Object.fromEntries((result.protocolView.branches ?? []).map((branch) => [branch.id, branch.armComponents]));

test('nested arms: the outer arm holds every component inside it, the inner arm only its own', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
function Card({ id }: { id: number }) @{ const label = computed(() => 'card ' + id); <p>{label}</p> }
function Note({ id }: { id: number }) @{ const label = computed(() => 'note ' + id); <em>{label}</em> }
export default function Page() @{
	let outer = state(true);
	let inner = state(false);
	let id = state(1);
	<div>
		<button onClick={() => (inner = !inner)}>Inner</button>
		@if (outer) {
			<section>
				<Card id={id} />
				@if (inner) {
					<Note id={id} />
				}
			</section>
		}
	</div>
}
`);
	expect(armComponents(result)).toEqual({ 'branch-site:0': [['c0:', 'c1:']], 'branch-site:1': [['c1:']] });
});

test('a @switch holding the same component in two arms names each placement under its own arm', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
function Panel({ tag }: { tag: string }) @{ const label = computed(() => 'panel ' + tag); <p>{label}</p> }
export default function Page() @{
	let mode = state('a');
	<div>
		<button onClick={() => (mode = mode === 'a' ? 'b' : 'a')}>Mode</button>
		@switch (mode) {
			@case 'a': {
				<Panel tag="a" />
			}
			@case 'b': {
				<Panel tag="b" />
			}
		}
	</div>
}
`);
	expect(armComponents(result)).toEqual({ 'branch-site:0': [['c0:'], ['c1:']] });
});

test('a branch whose arms hold no component, or only components with no computed, carries no arm components', async () => {
	const result = await compile(`
import { state } from '@markless/core';
function Icon({ name }: { name: string }) @{ <i>{name}</i> }
function Badge() @{ <b><Icon name="dot" /></b> }
export default function Page() @{
	let open = state(false);
	<div>
		<button onClick={() => (open = !open)}>Open</button>
		@if (open) {
			<p>Open</p>
		}
		@if (!open) {
			<Badge />
		}
	</div>
}
`);
	expect(result.protocolView.branches).toHaveLength(2);
	for (const branch of result.protocolView.branches ?? []) expect(branch).not.toHaveProperty('armComponents');
});

test('a component with no computed of its own is named when one it renders owns one', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
function Count({ n }: { n: number }) @{ const twice = computed(() => n * 2); <i>{twice}</i> }
function Frame({ n }: { n: number }) @{ <b><Count n={n} /></b> }
export default function Page() @{
	let n = state(1);
	<div>
		<button onClick={() => n++}>More</button>
		@if (n > 0) {
			<Frame n={n} />
		}
	</div>
}
`);
	expect(armComponents(result)).toEqual({ 'branch-site:0': [['c1:']] });
});

// Same structure, renamed and reshaped: the component sits in the @else arm, in a @for row, inside a @try.
test('an @else arm inside a @try names the row component it holds', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
function Line({ label }: { label: string }) @{ const shown = computed(() => label.toUpperCase()); <li>{shown}</li> }
async function fetchLabels(): Promise<string[]> { return ['x']; }
export function Ledger() @{
	let hidden = state(true);
	const labels = computed(async () => await fetchLabels());
	<main>
		<button onClick={() => (hidden = !hidden)}>Toggle</button>
		@try {
			@if (hidden) {
				<p>Hidden</p>
			} @else {
				<ul>
					@for (const label of labels; key label) {
						<Line label={label} />
					}
				</ul>
			}
		} @pending {
			<p>Loading</p>
		}
	</main>
}
`);
	const records = JSON.stringify(result.protocolView);
	expect(records).toContain('"armComponents":[[],["c0:"]]');
});
