import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import StockCount from './stock-count.tsrx';
import StockPlain from './stock-plain.tsrx';
import StockRows from './stock-rows.tsrx';

afterEach(() => {
	cleanup();
	forgetRequests();
});

const stock = () => [...document.querySelectorAll('[data-stock]')].map((cell) => cell.textContent);

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

// Only the first load is pinned: a row's @try does not yet follow a refresh of a list-level value.
const shapes = [
	['a method call with a callback', StockRows, () => renderSSR(StockRows), ['3', '5']],
	['a module function call beside the row item', StockCount, () => renderSSR(StockCount), ['Pen: 3 left', 'Ink: 5 left']],
	['a plain member read', StockPlain, () => renderSSR(StockPlain), ['2', '2']],
] as const;

for (const [shape, Rows, serve, first] of shapes) {
	test(`CSR: each row's @try reads a list-level async value through ${shape}`, async () => {
		await render(Rows);
		await reply('items');
		await reply('stock:0');
		await expect.poll(stock).toEqual(first);
	});

	test(`SSR: each row's @try reads a list-level async value through ${shape}`, async () => {
		await serve();
		expect(stock()).toEqual(first);
	});
}
