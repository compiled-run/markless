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

const updateModule = (result: Awaited<ReturnType<typeof compile>>) =>
	result.symbolModules.modules.find((module) => module.kind === 'async-boundary-update')?.source ?? '';

test('a @try whose value refreshes settles with the records that update it in place; one that never refreshes renders its value', async () => {
	const refreshing = await compile(`
import { computed, state } from '@markless/core';
async function load(n: number) { return { title: 't' + n }; }
export default function Page() @{
	let round = state(0);
	const issue = computed(async () => await load(round));
	<main>
		<button onClick={() => round++}>next</button>
		@try { <h2>{issue.title}</h2> } @pending { <p>wait</p> }
	</main>
}`);
	expect(updateModule(refreshing)).toContain('armRecords: marklessBoundaryRecords[arm]');
	const fixed = await compile(`
import { computed } from '@markless/core';
async function load() { return { title: 't' }; }
export default function Page() @{
	const issue = computed(async () => await load());
	<main>
		@try { <h2>{issue.title}</h2> } @pending { <p>wait</p> }
	</main>
}`);
	expect(updateModule(fixed)).not.toContain('armRecords');
});

test('a @try whose keyed rows hold two components still re-renders on refresh; rows the browser builds update in place', async () => {
	const twoChildren = await compile(`
import { computed, state } from '@markless/core';
async function load(unit: string) { return [{ sku: 'p', amount: unit === 'a' ? 1 : 2 }]; }
function Tag({ row }: { row: { amount: number } }) @{ <em>{row.amount}</em> }
function Note({ unit }: { unit: string }) @{ <small>{unit}</small> }
export default function Page() @{
	let unit = state('a');
	const rows = computed(async () => await load(unit));
	<main>
		<button onClick={() => (unit = 'b')}>b</button>
		@try {
			<ol>@for (const row of rows; key row.sku) { <li><Tag row={row} /><Note unit={unit} /></li> }</ol>
		} @pending { <p>wait</p> }
	</main>
}`);
	expect(twoChildren.protocolView.asyncBoundaries[0]?.rerendersOnRefresh).toBe(true);
	const wrapped = await compile(`
import { computed, state } from '@markless/core';
async function load(unit: string) { return [{ sku: 'p', amount: unit === 'a' ? 1 : 2 }]; }
function Tag({ row, unit }: { row: { amount: number }; unit: string }) @{ <em>{row.amount + unit}</em> }
export default function Page() @{
	let unit = state('a');
	const rows = computed(async () => await load(unit));
	<main>
		<button onClick={() => (unit = 'b')}>b</button>
		@try {
			<ol>@for (const row of rows; key row.sku) { <li><i>{row.amount + unit}</i><Tag row={row} unit={unit} /></li> }</ol>
		} @pending { <p>wait</p> }
	</main>
}`);
	expect(wrapped.protocolView.asyncBoundaries[0]?.rerendersOnRefresh).toBeUndefined();
});

test('keyed rows in a @try whose child and wrapper read page state are built by the browser', async () => {
	const result = await compile(`
import { computed, state } from '@markless/core';
async function load(unit: string) { return [{ sku: 'p', amount: unit === 'a' ? 1 : 2 }]; }
function Tag({ row, unit }: { row: { amount: number }; unit: string }) @{ <em>{row.amount + unit}</em> }
export default function Page() @{
	let unit = state('a');
	const rows = computed(async () => await load(unit));
	<main>
		<button onClick={() => (unit = 'b')}>b</button>
		@try {
			<ol>@for (const row of rows; key row.sku) { <li><i>{row.amount + unit}</i><Tag row={row} unit={unit} /></li> }</ol>
		} @pending { <p>wait</p> }
	</main>
}`);
	const [repeat] = result.protocolView.keyedRepeats ?? [];
	expect(repeat?.rowComponent).toMatchObject({ itemPropName: 'row', slotPath: [0, 1] });
	expect(repeat?.rowTemplate?.textSlots).toEqual([
		{
			path: [0, 0, 0],
			source: 'row.amount + unit',
			reads: [{ graphNodeId: 'state:unit', path: [] }],
		},
	]);
});
