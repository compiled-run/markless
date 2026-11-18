import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import PickedPage from './picked-page.tsrx';
import LoadedPage from './loaded-page.tsrx';

// The selected-row pattern the lists page recommends: the row gets plain props and works out `active` and its id itself.
afterEach(cleanup);

const poll = { timeout: 2_000 };
const rows = () => Array.from(document.querySelectorAll('li'), (row) => [row.id, row.className]);

async function picksB() {
	await expect.poll(rows, poll).toEqual([['item-a', 'on'], ['item-b', '']]);
	await userEvent.click(document.querySelector<HTMLElement>('[data-pick]')!);
	await expect.poll(rows, poll).toEqual([['item-a', ''], ['item-b', 'on']]);
}

test('CSR: a row over a state list follows the picked row', async () => {
	await render(PickedPage);
	await picksB();
});
test('SSR: a row over a state list follows the picked row', async () => {
	await renderSSR(PickedPage);
	await picksB();
});
test('CSR: a row over a loaded list follows the picked row', async () => {
	await render(LoadedPage);
	await picksB();
});
test('SSR: a row over a loaded list follows the picked row', async () => {
	await renderSSR(LoadedPage);
	await picksB();
});
