import { describe, expect, it } from 'vitest';
import { compileTsrxModule } from '../../../../packages/compiler/src/index.ts';
import { START_SOURCE } from './model.ts';
import { piecesOf } from './pieces.ts';

const explored = piecesOf(await compileTsrxModule({ filename: '/chat.tsrx', source: START_SOURCE, symbols: [] }), START_SOURCE);

describe('the compiler figure starts from a real compile', () => {
	it('lists the state, the update and the handler in source order, each tied to its line', () => {
		expect(explored.errors).toEqual([]);
		expect(explored.pieces.map((p) => [p.id, p.kind, p.line])).toEqual([
			['state:draft', 'state', 3],
			['symbol:1', 'update', 6],
			['symbol:0', 'handler', 8],
		]);
	});

	it('washes exactly the span each piece came from', () => {
		const lines = START_SOURCE.split('\n');
		expect(explored.pieces.map((p) => lines[p.line]!.slice(p.from, p.to))).toEqual(["let draft = state('Hi')", '{draft}', 'onInput={(e) => (draft = e.target.value)}']);
	});

	it('freezes the starting pieces the figure shows before any edit (run with -u after editing)', async () => {
		await expect(`// Written by start.test.ts from a real compile of START_SOURCE. Run the figure test with -u to refresh.
import type { Explored } from './pieces.ts';

export const START: Explored = ${JSON.stringify(explored, null, '\t')};
`).toMatchFileSnapshot('./start.art.ts');
	});

	it('loses the state cell and its update, and reports the handler, once state() is removed', async () => {
		const plain = START_SOURCE.replace("state('Hi')", "'Hi'");
		const result = piecesOf(await compileTsrxModule({ filename: '/chat.tsrx', source: plain, symbols: [] }), plain);
		expect(result.pieces.map((p) => p.id)).toEqual(['symbol:0']);
		expect(result.errors).toContain('MARKLESS_HANDLER_READS_RENDER_LOCAL');
	});
});
