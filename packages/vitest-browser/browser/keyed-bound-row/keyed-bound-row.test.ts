import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './kbr-page.tsrx';

// A handler bound by its composer inside a keyed row under a projection writes the row's own cell.
afterEach(cleanup);

const marks = () => [...document.querySelectorAll<HTMLButtonElement>('[data-mark]')];
const counts = () => marks().map((mark) => mark.textContent);

async function pressEachRow() {
	expect(counts()).toEqual(['0', '0', '0']);
	marks()[1]!.click();
	await expect.poll(counts).toEqual(['0', '5', '0']);
	marks()[2]!.click();
	await expect.poll(counts).toEqual(['0', '5', '7']);
}

test('CSR: a bound handler in a projected keyed row writes its own row', async () => {
	await render(Page);
	await pressEachRow();
});

test('SSR: a bound handler in a projected keyed row writes its own row', async () => {
	await renderSSR(Page);
	await pressEachRow();
});
