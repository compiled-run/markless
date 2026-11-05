import { describe, expect, it } from 'vitest';
import { compileTsrxModule } from '../../../../packages/compiler/src/index.ts';
import { START_SOURCE } from './model.ts';
import { piecesOf } from './pieces.ts';

const explored = piecesOf(await compileTsrxModule({ filename: '/chat.tsrx', source: START_SOURCE, symbols: [] }), START_SOURCE);

describe('the compiler figure starts from a real compile', () => {
	it('lists the state, the handler and the update, each tied to its line', () => {
		expect(explored.errors).toEqual([]);
		expect(explored.pieces.map((p) => [p.id, p.line])).toEqual([
			['state:draft', 3],
			['symbol:0', 7],
			['symbol:1', 6],
		]);
	});

	it('freezes the starting pieces the figure shows before any edit (run with -u after editing)', async () => {
		await expect(`// Written by start.test.ts from a real compile of START_SOURCE. Run the figure test with -u to refresh.
export const START = ${JSON.stringify(explored, null, '\t')};
`).toMatchFileSnapshot('./start.art.ts');
	});

	it('loses the state cell and its update, and reports the handler, once state() is removed', async () => {
		const plain = START_SOURCE.replace("state('Hi')", "'Hi'");
		const result = piecesOf(await compileTsrxModule({ filename: '/chat.tsrx', source: plain, symbols: [] }), plain);
		expect(result.pieces.map((p) => p.id)).toEqual(['symbol:0']);
		expect(result.errors).toContain('MARKLESS_HANDLER_READS_RENDER_LOCAL');
	});
});
