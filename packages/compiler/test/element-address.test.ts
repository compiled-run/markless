import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Arm and row records address an element by counting element children only, from whichever end has a fixed count.
const UNADDRESSABLE = 'MARKLESS_ELEMENT_UNADDRESSABLE';

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
}

type Compiled = Awaited<ReturnType<typeof compile>>;

const armEvents = (compiled: Compiled) =>
	(compiled.protocolView.branches ?? []).flatMap((branch) =>
		(branch.armRecords ?? []).flatMap((arm) =>
			arm.events.map((event) => [event.eventName, event.hostPath]),
		),
	);
const rowEvents = (compiled: Compiled) =>
	(compiled.protocolView.keyedRepeats ?? []).flatMap((repeat) =>
		repeat.rowEvents.map((event) => [event.eventName, event.hostPath]),
	);
const refusals = (compiled: Compiled) =>
	compiled.symbolModules.diagnostics.filter((entry) => entry.code === UNADDRESSABLE);

test('text and interpolation before a control count no element', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export default function Page() @{
	let open = state(true);
	let count = state(0);
	<main>
		@if (open) {
			<section>
				Total {count} items
				<form onSubmit={(event) => event.preventDefault()}><button>Send</button></form>
				and {count} more
				<button onClick={() => count++}>bump</button>
			</section>
		}
	</main>
}`);
	expect(armEvents(compiled)).toEqual([
		['submit', [0, 0]],
		['click', [0, 1]],
	]);
	expect(refusals(compiled)).toEqual([]);
});

test('a nested @if counts as one step, whatever its arm renders', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
function Card({ shown }: { shown: boolean }) @{
	let extra = state(true);
	let picks = state(0);
	@if (shown) {
		<article>
			<h3>title</h3>
			@if (extra) {
				<>
					<em>one</em>
					<em>two</em>
				</>
			}
			<input onInput={() => picks++} />
			<span>{picks}</span>
			<a onClick={() => (extra = !extra)}>toggle</a>
		</article>
	}
}
export default function Page() @{
	<div><Card shown={true} /></div>
}`);
	expect(armEvents(compiled)).toEqual([
		['input', [0, 2]],
		['click', [0, 4]],
	]);
});

test('a row control after interpolated text counts no text node', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export default function Page() @{
	let rows = state([{ id: 1, label: 'a' }]);
	let picked = state('');
	<ul>
		@for (const row of rows; key row.id) {
			<li>{row.label} and <b>{row.id}</b> then <button onClick={() => (picked = row.label)}>go</button></li>
		}
	</ul>
}`);
	expect(rowEvents(compiled)).toEqual([['click', [1]]]);
});

test('an element with a construct of unknown count on both sides is refused', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
export default function Page() @{
	let open = state(true);
	let items = state([{ id: 1 }]);
	let hits = state(0);
	<main>
		@if (open) {
			<section>
				@for (const item of items; key item.id) { <p>{item.id}</p> }
				<button onClick={() => hits++}>hit</button>
				@for (const item of items; key item.id) { <p>{item.id}</p> }
			</section>
		}
	</main>
}`);
	expect(refusals(compiled)).toHaveLength(1);
	expect(refusals(compiled)[0]?.severity).toBe('error');
});

test('a fixed-count construct beside a control still lets it count from that side', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
function Pair() @{
	<>
		<i>left</i>
		<i>right</i>
	</>
}
export default function Page() @{
	let open = state(true);
	let items = state([{ id: 1 }]);
	let hits = state(0);
	<main>
		@if (open) {
			<nav>
				<Pair />
				<button onClick={() => hits++}>hit</button>
				@for (const item of items; key item.id) { <p>{item.id}</p> }
			</nav>
		}
	</main>
}`);
	expect(armEvents(compiled)).toEqual([['click', [0, 2]]]);
	expect(refusals(compiled)).toEqual([]);
});

test('a control after a @for counts back from the parent end', async () => {
	const compiled = await compile(`import { state } from '@markless/core';
function Panel({ open }: { open: boolean }) @{
	let items = state([{ id: 1 }]);
	let hits = state(0);
	@if (open) {
		<section>
			<h3>list</h3>
			@for (const item of items; key item.id) { <p>{item.id}</p> }
			<button onClick={() => hits++}>hit</button>
			@if (hits > 2) { <em>many</em> }
			<span>{hits}</span>
		</section>
	}
}
export default function Page() @{
	<main><Panel open={true} /></main>
}`);
	expect(armEvents(compiled)).toEqual([['click', [0, -3]]]);
	expect(refusals(compiled)).toEqual([]);
});

test('an imported component of one root element counts as one step', async () => {
	const card = await compileTsrxModule({
		filename: 'src/Card.tsrx',
		source: `export default function Card() @{
	<figure><figcaption>caption</figcaption></figure>
}`,
		symbols: [],
	});
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
import Card from './Card.tsrx';
const SHOWN = true;
export default function Page() @{
	let tab = state('a');
	<main>
		@if (SHOWN) {
			<article>
				<Card />
				<div><button onClick={() => (tab = 'b')}>{tab}</button></div>
				<Card />
			</article>
		}
	</main>
}`,
		symbols: [],
		importedModuleInterfaces: { './Card.tsrx': card.moduleGraphInterface },
	});
	expect(refusals(compiled)).toEqual([]);
	expect(armEvents(compiled)).toEqual([['click', [0, 1, 0]]]);
});

test('an imported component whose root is a @for still refuses', async () => {
	const list = await compileTsrxModule({
		filename: 'src/List.tsrx',
		source: `export default function List({ items }: { items: ReadonlyArray<{ id: number }> }) @{
	@for (const item of items; key item.id) { <p>{item.id}</p> }
}`,
		symbols: [],
	});
	const compiled = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
import List from './List.tsrx';
const SHOWN = true;
export default function Page() @{
	let hits = state(0);
	<main>
		@if (SHOWN) {
			<section>
				<List items={[{ id: 1 }]} />
				<button onClick={() => hits++}>{hits}</button>
				<List items={[{ id: 2 }]} />
			</section>
		}
	</main>
}`,
		symbols: [],
		importedModuleInterfaces: { './List.tsrx': list.moduleGraphInterface },
	});
	expect(refusals(compiled)).toHaveLength(1);
});
