import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// A row the browser cannot build only matters when its list can change after load.
const list = (head: string, collection: string) => `import { state } from '@markless/core';
import Chip from './chip.tsrx';
const MARKS = [{ key: 'a', on: true }, { key: 'b', on: false }];
export function List(${head}) @{
	let live = state([{ key: 'a', on: true }]);
	<ul onClick={() => live.push({ key: 'c', on: true })}>
		@for (const mark of ${collection}; key mark.key) {
			<li>
				@if (mark.on) {
					<b>on</b>
				}
				<Chip label={mark.key} />
			</li>
		}
	</ul>
}
`;

async function rowWarnings(source: string) {
	const result = await compileTsrxModule({ filename: '/app/list.tsrx', source, symbols: [] });
	return collectTsrxModuleDiagnostics(result)
		.filter((diagnostic) =>
			['MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED', 'MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED'].includes(
				diagnostic.code,
			),
		)
		.map((diagnostic) => [diagnostic.code, diagnostic.decidedByProps ?? null]);
}

test('rows over a module constant never change, so they warn about nothing', async () => {
	expect(await rowWarnings(list('', 'MARKS'))).toEqual([]);
});

test('rows over a prop warn, naming the prop the build checks every caller for', async () => {
	const decided = { componentName: 'List', props: ['marks'] };
	expect(await rowWarnings(list('{ marks }', 'marks'))).toEqual([
		['MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED', decided],
		['MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED', decided],
	]);
});

test('rows over state warn with nothing a caller can settle', async () => {
	expect(await rowWarnings(list('', 'live'))).toEqual([
		['MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED', null],
		['MARKLESS_ROW_BRANCH_FLIP_UNSUPPORTED', null],
	]);
});
