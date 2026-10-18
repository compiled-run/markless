import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const UNPLACED = 'MARKLESS_KEYED_REPEAT_ROWS_UNPLACED';

async function compileList(body: string) {
	return compileTsrxModule({
		filename: 'src/Lists.tsrx',
		source: `import { state } from '@markless/core';

export function Lists() @{
	let items = state([{ id: 'a', on: true }]);
	let shown = state(false);
	${body}
}
`,
		symbols: [],
	});
}

const placement = (compiled: Awaited<ReturnType<typeof compileList>>) =>
	(compiled.protocolView.keyedRepeats ?? []).map((repeat) => ({
		start: repeat.rowStartOffset ?? 0,
		end: repeat.rowEndOffset,
	}));
const unplaced = (compiled: Awaited<ReturnType<typeof compileList>>) =>
	compiled.publicRenderPlan.diagnostics.filter((entry) => entry.code === UNPLACED);

test('rows after another list are counted from the parent end', async () => {
	const compiled = await compileList(`<main>
		<h2>one</h2>
		@for (const item of items; key item.id) { <p>{item.id}</p> }
		<h2>two</h2>
		@for (const item of items; key item.id) { <div>{item.id}</div> }
		<hr />
		<hr />
	</main>`);
	expect(placement(compiled)).toEqual([
		{ start: 1, end: undefined },
		{ start: 0, end: 2 },
	]);
	expect(unplaced(compiled)).toEqual([]);
});

test('rows after a branch and before nothing end the parent', async () => {
	const compiled = await compileList(`<ol>
		@if (shown) { <li>notice</li> }
		@for (const item of items; key item.id) { <li>{item.id}</li> }
	</ol>`);
	expect(placement(compiled)).toEqual([{ start: 0, end: 0 }]);
});

test('rows with a run-time element count on both sides are refused, not left frozen', async () => {
	const compiled = await compileList(`<section>
		@for (const item of items; key item.id) { <i>{item.id}</i> }
		<span>between</span>
		@for (const item of items; key item.id) { <b>{item.id}</b> }
		@if (shown) { <em>after</em> }
	</section>`);
	expect(unplaced(compiled).map((entry) => entry.severity)).toEqual(['error']);
	expect(unplaced(compiled)[0]!.message).toContain('@for over item');
});
