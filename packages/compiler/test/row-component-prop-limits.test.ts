import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

async function codes(row: string, rowSignature: string, page: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/row.tsrx',
			importSource: './row.tsrx',
			source: `export default function Row(${rowSignature}) @{\n\t${row}\n}\n`,
		},
		{
			filename: 'src/page.tsrx',
			source: `import { state } from '@markless/core';
import Row from './row.tsrx';

export default function Page() @{
	let picked = state('a');
	let items = state([{ id: 'a' }, { id: 'b' }]);

	<main>
		<ul>
			@for (const item of items; key item.id) {
				${page}
			}
		</ul>
		<button onClick={() => (picked = 'b')}>Pick b</button>
	</main>
}
`,
		},
	]);
	return results.flatMap((result) => collectTsrxModuleDiagnostics(result).map((diagnostic) => diagnostic.code));
}

// A component row is rebuilt only when its item or index moves, and the page's record of a keyed list has no place to name the other state a row prop reads.
test.fails('a component row prop that compares its row item with page state builds', async () => {
	expect(
		await codes(
			`<li class={active ? 'on' : ''}>{id}</li>`,
			'{ id, active }: { id: string; active: boolean }',
			'<Row id={item.id} active={item.id === picked} />',
		),
	).toEqual([]);
});

// A prop cell in the browser holds only a plain value, so an expression reading a member of an object prop has nothing to follow.
test.fails('a row expression over a member of the object prop it was given stays current', async () => {
	expect(
		await codes(
			`<li id={'item-' + item.id}>{item.id}</li>`,
			'{ item }: { item: { id: string } }',
			'<Row item={item} />',
		),
	).toEqual([]);
});

test('the row the lists page recommends instead, plain props compared inside the row, builds clean', async () => {
	expect(
		await codes(
			`<li id={'item-' + id} class={id === picked ? 'on' : ''}>{id}</li>`,
			'{ id, picked }: { id: string; picked: string }',
			'<Row id={item.id} picked={picked} />',
		),
	).toEqual([]);
});
