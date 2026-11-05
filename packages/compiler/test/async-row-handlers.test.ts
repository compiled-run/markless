import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });

const handlerSources = (result: Awaited<ReturnType<typeof compile>>) =>
	result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);

test('a handler reads an async value as its resolved value, never its snapshot', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
async function load() { return { id: 1, label: 'one' }; }
export default function Page() @{
	let note = state('');
	const item = computed(async () => await load());
	<main>
		@try {
			<div>
				<b>{item.label}</b>
				<button onClick={() => (note = JSON.stringify({ ...item }))}>copy</button>
				<button onClick={() => { const { id } = item; note = String(id); }}>id</button>
				<button onClick={() => (note = item.label)}>label</button>
			</div>
		} @pending { <p>wait</p> }
		<output>{note}</output>
	</main>
}`);
	const [spread, destructure, member] = handlerSources(result);
	expect(spread).toContain('{ ...context.graph.read("computed:item", ["value"]) }');
	expect(destructure).toContain('const { id } = context.graph.read("computed:item", ["value"])');
	expect(member).toContain('context.graph.read("computed:item", ["label"])');
});

test('an @if in a row of a list inside @try flips per row, with its arm events on the row', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
async function load() { return [{ key: 'a', done: false }]; }
export default function Page() @{
	let last = state('');
	const jobs = computed(async () => await load());
	<main>
		<output>{last}</output>
		@try {
			<ul>
				@for (const job of jobs; key job.key) {
					<li>@if (job.done) { <i>done</i> } @else { <button onClick={() => (last = job.key)}>finish</button> }</li>
				}
			</ul>
		} @pending { <p>wait</p> }
	</main>
}`);
	const [repeat] = result.protocolView.keyedRepeats ?? [];
	expect(repeat?.rowTemplate?.branchSlots?.map((slot) => slot.source)).toEqual(['job.done']);
	expect(repeat?.rowEvents.map((event) => event.arm)).toEqual([{ slot: 0, arm: 1 }]);
	const [tryRecords] = result.protocolView.asyncBoundaries[0]!.armRecords as ReadonlyArray<{
		readonly events: ReadonlyArray<unknown>;
		readonly branches?: ReadonlyArray<unknown>;
	}>;
	expect(tryRecords?.events).toEqual([]);
	expect(tryRecords?.branches).toBeUndefined();
});

test('a @try whose values are all wired keeps its elements on refresh; one with a nested construct does not', async () => {
	const live = await compile(`
import { computed, state } from '@markless/core';
async function load(n: number) { return [{ sku: 'p', price: n }]; }
export default function Page() @{
	let round = state(0);
	const prices = computed(async () => await load(round));
	<main>
		<button onClick={() => round++}>reload</button>
		@try {
			<table><caption>{prices.length} rows</caption><tbody>
				@for (const row of prices; key row.sku) { <tr data-sku={row.sku}><td>{row.price}</td></tr> }
			</tbody></table>
		} @pending { <p>wait</p> }
	</main>
}`);
	expect(live.protocolView.asyncBoundaries[0]?.refreshesInPlace).toBe(true);
	const branching = await compile(`
import { computed, state } from '@markless/core';
async function load(n: number) { return { open: n > 0, title: 't' }; }
export default function Page() @{
	let round = state(0);
	const panel = computed(async () => await load(round));
	<main>
		<button onClick={() => round++}>reload</button>
		@try {
			<section>@if (panel.open) { <h2>{panel.title}</h2> } @else { <p>shut</p> }</section>
		} @pending { <p>wait</p> }
	</main>
}`);
	expect(branching.protocolView.asyncBoundaries[0]?.refreshesInPlace).toBeUndefined();
});
