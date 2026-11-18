import { beforeEach, expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import PickBarrelPage from './e-pick-barrel-page.tsrx';
import PickPage from './e-pick-page.tsrx';
import PickRenamedPage from './e-pick-renamed-page.tsrx';
import { installServer, resetServer, server } from './grid-server.ts';
import { lines } from './timeline.ts';

// Prop-fed rows of a row component from another file: add, remove and reorder, and each row's handler acts on its own item.
installServer();
beforeEach(resetServer);

const poll = { timeout: 4_000, interval: 10 };
const click = (selector: string, at = 0) => document.querySelectorAll<HTMLElement>(selector)[at]!.click();
const rows = (...labels: string[]) => labels.map((label) => `row: ${label}`);

async function picks(at: number, id: string) {
	const from = server.details.length;
	click('[data-pick]', at);
	await expect.poll(() => server.details.slice(from), poll).toEqual([id]);
}

async function editsAndPicks() {
	await expect.poll(() => lines(), poll).toEqual(rows('one', 'two'));
	await picks(1, 'r2');
	click('[data-grid-add]');
	await expect.poll(() => lines(), poll).toEqual(rows('one', 'two', 'row 3'));
	await picks(2, 'r3');
	click('[data-grid-remove]');
	await expect.poll(() => lines(), poll).toEqual(rows('two', 'row 3'));
	await picks(0, 'r2');
	click('[data-grid-reverse]');
	await expect.poll(() => lines(), poll).toEqual(rows('row 3', 'two'));
	await picks(0, 'r3');
	await picks(1, 'r2');
}

test('imported row component: CSR', async () => {
	await render(PickPage);
	await editsAndPicks();
});
test('imported row component: SSR', async () => {
	await renderSSR(PickPage);
	await editsAndPicks();
});
test('row component through a barrel: CSR', async () => {
	await render(PickBarrelPage);
	await editsAndPicks();
});
test('row component through a barrel: SSR', async () => {
	await renderSSR(PickBarrelPage);
	await editsAndPicks();
});
test('default row component under another local name: CSR', async () => {
	await render(PickRenamedPage);
	await editsAndPicks();
});
test('default row component under another local name: SSR', async () => {
	await renderSSR(PickRenamedPage);
	await editsAndPicks();
});
