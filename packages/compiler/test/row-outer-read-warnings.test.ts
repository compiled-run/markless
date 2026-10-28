import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function codes(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Rows.tsrx', source, symbols: [] });
	return collectTsrxModuleDiagnostics(result).map((diagnostic) => diagnostic.code);
}

const rows = (row: string, collection = 'marks') => `import { state } from '@markless/core';
import Chip from './chip.tsrx';
const MARKS = [{ key: 'a' }, { key: 'b' }];
export function Rows() @{
	let marks = state([{ key: 'a' }, { key: 'b' }]);
	let pressed = state('a');
	<ul>
		@for (const mark of ${collection}; key mark.key) {
			${row}
		}
	</ul>
}
`;

// The row template carries the slot with its outer reads, so a minted row follows them.
test.each([
	['over state', 'marks'],
	['over a module constant', 'MARKS'],
])('a minted row %s reading state from outside the @for does not warn it is static', async (_, collection) => {
	expect(
		await codes(
			rows(
				`<li class={pressed === mark.key ? 'on' : 'off'}>{pressed === mark.key ? 'yes' : 'no'}</li>`,
				collection,
			),
		),
	).not.toContain('MARKLESS_TEMPLATE_EXPRESSION_STATIC');
});

test('a row that cannot be minted still warns that its outer read is static', async () => {
	expect(
		await codes(rows(`<li class={pressed === mark.key ? 'on' : 'off'}><Chip label={mark.key} /></li>`)),
	).toEqual(
		expect.arrayContaining([
			'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED',
			'MARKLESS_TEMPLATE_EXPRESSION_STATIC',
		]),
	);
});
