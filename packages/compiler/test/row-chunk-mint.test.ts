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

test('a row whose @if reads only the row item patches from its row template instead of being rebuilt', async () => {
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
	expect(repeat?.rowComponent).toBeUndefined();
	expect(repeat?.rowTemplate?.branchSlots?.[0]?.arms.map((arm) => arm.html)).toEqual([
		'<s><!--markless-slot:0--></s>',
		'<span><!--markless-slot:0--></span>',
	]);
	expect(rowMintCodes).toEqual([]);
});

test('a nested @for whose rows hold an @if gives the enclosing row markup to build from', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';

export function Lists() @{
	let lists = state([{ key: 'a', items: [{ id: 1, view: 'x' }] }]);

	<section>
		@for (const list of lists; key list.key) {
			<ol>@for (const item of list.items; key item.id) { <li>@if (item.view === "x") { <b>x</b> }</li> }</ol>
		}
	</section>
}
`,
		symbols: [],
	});
	const [outer, inner] = result.protocolView.keyedRepeats ?? [];
	expect(outer?.rowTemplate?.html).toBe('<ol><!--markless-slot:0--></ol>');
	expect(inner?.enclosingRow?.repeatId).toBe(outer?.id);
	expect(inner?.rowTemplate?.branchSlots).toHaveLength(1);
});

test('a nested @for whose row @if holds a component still gives the enclosing row markup', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';

function Badge({ label }) @{
	<b>{label}</b>
}

export function Lists() @{
	let lists = state([{ key: 'a', items: [{ id: 1, on: true, label: 'A' }] }]);

	<section>
		@for (const list of lists; key list.key) {
			<ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <Badge label={item.label} /> } @else { <i>off</i> }</li> }</ol>
		}
	</section>
}
`,
		symbols: [],
	});
	const [outer, inner] = result.protocolView.keyedRepeats ?? [];
	expect(outer?.rowTemplate?.html).toBe('<ol><!--markless-slot:0--></ol>');
	expect(inner?.rowComponent).toEqual({ componentName: 'Lists', rowChunkId: 'repeat:repeat:1:row' });
});

test('a nested @for whose rows hold an @if inside an @if arm is refused, not dropped', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `
import { state } from '@markless/core';

export function Lists() @{
	let open = state(true);
	let lists = state([{ key: 'a', items: [{ id: 1, on: true }] }]);

	<section>
		<button onClick={() => open = !open}>toggle</button>
		@if (open) {
			<div>@for (const list of lists; key list.key) { <ol>@for (const item of list.items; key item.id) { <li>@if (item.on) { <b>on</b> }</li> }</ol> }</div>
		}
	</section>
}
`,
		symbols: [],
	});
	expect(
		result.symbolModules.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toEqual([expect.objectContaining({ severity: 'error' })]);
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
