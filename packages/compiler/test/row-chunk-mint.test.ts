import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const ROW_MINT_UNSUPPORTED = 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return {
		repeat: result.protocolView.keyedRepeats?.[0],
		rowMintCodes: result.publicRenderPlan.diagnostics
			.map((diagnostic) => diagnostic.code)
			.filter((code) => code === ROW_MINT_UNSUPPORTED),
	};
}

test('a row whose @if reads only the row item names its row chunk for the mint', async () => {
	const { repeat, rowMintCodes } = await compile(`
import { state } from '@markless/core';

export function App() @{
	let todos = state([{ id: 'a', done: false, title: 'A' }]);

	<ul>
		@for (const todo of todos; key todo.id) {
			<li>@if (todo.done) { <s>{todo.title}</s> } @else { <span>{todo.title}</span> }</li>
		}
	</ul>
}
`);
	expect(repeat?.rowComponent).toEqual({ componentName: 'App', rowChunkId: 'repeat:repeat:0:row' });
	expect(repeat?.rowTemplate).toBeUndefined();
	expect(rowMintCodes).toEqual([]);
});

test('a @switch row with a child component in one arm mints the same way', async () => {
	const { repeat, rowMintCodes } = await compile(`
import { state } from '@markless/core';

function Badge({ label }) @{
	let seen = state(0);
	<em onClick={() => seen = seen + 1}>{label}</em>
}

export function Board() @{
	let cards = state([{ code: 'x', kind: 'note', text: 'X' }]);

	<section>
		<ol>
			@for (const card of cards; key card.code) {
				<li class="card">
					<b>{card.code}</b>
					@switch (card.kind) {
						@case 'badge': { <Badge label={card.text} /> }
						@default: { <p>{card.text}</p> }
					}
				</li>
			}
		</ol>
	</section>
}
`);
	expect(repeat?.rowComponent).toEqual({
		componentName: 'Board',
		rowChunkId: 'repeat:repeat:0:row',
	});
	expect(rowMintCodes).toEqual([]);
});

test('a row whose @if reads page state grows and flips from its row template', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	let open = state(false);
	let todos = state([{ id: 'a', title: 'A' }]);

	<ul>
		<button onClick={() => open = !open}>Toggle</button>
		@for (const todo of todos; key todo.id) {
			<li>@if (open) { <s>{todo.title}</s> } @else { <span>x</span> }</li>
		}
	</ul>
}
`,
		symbols: [],
	});
	const repeat = result.protocolView.keyedRepeats?.[0];
	expect(repeat?.rowComponent).toBeUndefined();
	expect(repeat?.rowTemplate?.branchSlots?.[0]).toMatchObject({
		graphNodeId: 'state:open',
		graphPath: [],
	});
	expect(
		result.publicRenderPlan.diagnostics.filter(
			(diagnostic) => diagnostic.code === ROW_MINT_UNSUPPORTED,
		),
	).toEqual([]);
});

test('an owner element with its own handler inside an arm rides the row template as an arm event', async () => {
	const { repeat, rowMintCodes } = await compile(`
import { state } from '@markless/core';

export function App() @{
	let picked = state('');
	let todos = state([{ id: 'a', done: false }]);

	<ul>
		<output>{picked}</output>
		@for (const todo of todos; key todo.id) {
			<li>@if (todo.done) { <button onClick={() => picked = 'done'}>Done</button> } @else { <span>open</span> }</li>
		}
	</ul>
}
`);
	expect(repeat?.rowComponent).toBeUndefined();
	expect(repeat?.rowEvents).toEqual([
		expect.objectContaining({ hostPath: [0], eventName: 'click', arm: { slot: 0, arm: 0 } }),
	]);
	expect(rowMintCodes).toEqual([]);
});
