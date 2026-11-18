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

test("a row's @try names the page state its arm's text and attributes read, not the async value it waits on", async () => {
	const [boundary] = await boundaries(ROWS);
	expect(boundary?.rerenderReads).toEqual([
		{ graphNodeId: 'state:taps', path: [] },
		{ graphNodeId: 'state:label', path: [] },
	]);
});

test('a @try outside any row names nothing: its own records update its text', async () => {
	const [boundary] = await boundaries(
		ROWS.replace('@for (const item of items; key item.id) {', '@if (items.length) {').replaceAll('item.', 'items[0].'),
	);
	expect(boundary?.rerenderReads).toBeUndefined();
});

test("a list inside the row's @try keeps its own rows' reads", async () => {
	const [boundary] = await boundaries(
		ROWS.replace(
			'<p><b>{item.name} {taps}</b><i title={label}>{stock.find((line) => line.id === item.id)?.count}</i></p>',
			'<ol>@for (const line of stock; key line.id) { <li>{line.count} {taps}</li> }</ol>',
		),
	);
	expect(boundary?.rerenderReads).toBeUndefined();
});
