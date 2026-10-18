import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A child rendered per row reads the row's item in its handler; the item exists in the browser only
// as the row the click landed in, so the slot routes to that row rather than to a graph node.
async function compile(passed: string, read: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: `import { state } from '@markless/core';
function Cell({ cell }: { readonly cell: { readonly id: string; readonly meta: { readonly at: number } } }) @{
	let seen = state('');
	<button onClick={() => (seen = String(${read}))}>{seen}</button>
}
export default function Page() @{
	let rows = state([{ id: 'a', meta: { at: 1 } }]);
	let shown = state('');
	<main>
		@for (const entry of rows; key entry.id) {
			<Cell cell={${passed}} />;
		}
		<p>{shown}</p>
	</main>
}
`,
		symbols: [],
	});
	const routes = compiled.captureAnalysis.extractedSymbols.flatMap((symbol) =>
		symbol.captureSlots.flatMap((slot) => slot.routes),
	);
	return {
		rowLocal: routes.filter((route) => route.kind === 'row-local'),
		diagnostics: compiled.captureAnalysis.diagnostics.map((diagnostic) => diagnostic.code),
	};
}

test('a row item passed whole routes a member read to that row', async () => {
	const { rowLocal, diagnostics } = await compile('entry', 'cell.id');
	expect(rowLocal).toEqual([expect.objectContaining({ itemName: 'entry', path: ['id'] })]);
	expect(diagnostics).not.toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
});

test('a member path of the row item keeps its own path ahead of the read', async () => {
	const { rowLocal } = await compile('entry.meta', 'cell.at');
	expect(rowLocal).toEqual([
		expect.objectContaining({ itemName: 'entry', path: ['meta', 'at'] }),
	]);
});

test('a computed expression of the row item is still refused', async () => {
	const { rowLocal, diagnostics } = await compile('{ ...entry }', 'cell.id');
	expect(rowLocal).toEqual([]);
	expect(diagnostics).toContain('MARKLESS_CAPTURE_OPAQUE_PROP');
});
