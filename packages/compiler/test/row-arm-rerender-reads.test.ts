import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A keyed row holding a @try has no row template, so the arm names what its text reads beside its async values.

const ROWS = `
import { computed, state } from '@markless/core';

export default function Shelf() @{
	let taps = state(0);
	let label = state('x');
	const items = state([{ id: 1, name: 'Pen' }]);
	const stock = computed(async () => [{ id: 1, count: 3 }]);

	<ul>
		@for (const item of items; key item.id) {
			<li>
				@try {
					<p><b>{item.name} {taps}</b><i title={label}>{stock.find((line) => line.id === item.id)?.count}</i></p>
				} @pending {
					<em>{taps}</em>
				}
			</li>
		}
	</ul>
}
`;

async function boundaries(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });
	return compiled.protocolView.asyncBoundaries;
}

test("a row's @try names the page state its arm's text and attributes read, and the list its row reads, not the async value it waits on", async () => {
	const [boundary] = await boundaries(ROWS);
	expect(boundary?.rerenderReads).toEqual([
		{ graphNodeId: 'state:taps', path: [] },
		{ graphNodeId: 'state:label', path: [] },
		{ graphNodeId: 'state:items', path: [] },
	]);
	// Text reading the row has no record a refresh could update in place.
	expect(boundary?.rerendersOnRefresh).toBe(true);
});

test('a @try outside any row names nothing: its own records update its text', async () => {
	const [boundary] = await boundaries(
		ROWS.replace('@for (const item of items; key item.id) {', '@if (items.length) {').replaceAll('item.', 'items[0].'),
	);
	expect(boundary?.rerenderReads).toBeUndefined();
});

test("a list inside the row's @try keeps its own rows' reads, and an arm not reading its row names no list", async () => {
	const [boundary] = await boundaries(
		ROWS.replace(
			'<p><b>{item.name} {taps}</b><i title={label}>{stock.find((line) => line.id === item.id)?.count}</i></p>',
			'<ol>@for (const line of stock; key line.id) { <li>{line.count} {taps}</li> }</ol>',
		),
	);
	expect(boundary?.rerenderReads).toBeUndefined();
});

const BRANCHES = `
import { computed, state } from '@markless/core';

export default function Shelf() @{
	let open = state(false);
	let picked = state(0);
	const items = state([{ id: 1, name: 'Pen' }]);
	const stock = computed(async () => [{ id: 1, count: 3 }]);

	<ul>
		@for (const item of items; key item.id) {
			<li>
				@try {
					<p>
						@if (open) {
							<b>{item.name} open</b>
						} @else {
							<i>{item.name} shut</i>
						}
						@if (picked === item.id) {
							<em>{item.name}</em>
						}
						{stock.find((line) => line.id === item.id)?.count}
					</p>
				} @pending {
					<em>…</em>
				}
			</li>
		}
	</ul>
}
`;

test("an @if in a row's @try arm is redrawn with the arm: its test's reads join the arm's, row item aside, and it ships no flip of its own", async () => {
	const compiled = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source: BRANCHES, symbols: [] });
	const [boundary] = compiled.protocolView.asyncBoundaries;
	expect(boundary?.rerenderReads).toEqual([
		{ graphNodeId: 'state:open', path: [] },
		{ graphNodeId: 'state:picked', path: [] },
		{ graphNodeId: 'state:items', path: [] },
	]);
	const tryRecords = Array.isArray(boundary?.armRecords) ? boundary.armRecords[0] : boundary?.armRecords;
	expect(tryRecords?.branches).toBeUndefined();
	expect(compiled.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
});
