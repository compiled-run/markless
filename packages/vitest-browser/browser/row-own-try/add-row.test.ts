import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AddRowPage from './add-row-page.tsrx';
import { forgetRequests } from './gate.ts';
import { counts, reply } from './rows.ts';

// A row added after the page rendered holds its own @try, which settles from the value already loaded.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function addDropAdd() {
	press('[data-add]');
	await expect.poll(counts).toEqual(['Pen: 10', 'Ink: 20']);
	press('[data-drop]');
	await expect.poll(counts).toEqual(['Pen: 10']);
	press('[data-add]');
	await expect.poll(counts).toEqual(['Pen: 10', 'Ink: 20']);
	press('[data-rename]');
	await expect.poll(counts).toEqual(['Pen: 10', 'Nib: 20']);
	press('[data-again]');
	await reply('restock:1');
	await expect.poll(counts).toEqual(['Pen: 11', 'Nib: 21']);
}

test('CSR: a row added with its own @try shows its value, and again after it is removed', async () => {
	await render(AddRowPage);
	await reply('restock:0');
	await expect.poll(counts).toEqual(['Pen: 10']);
	await addDropAdd();
});

test('SSR: a row added with its own @try shows its value, and again after it is removed', async () => {
	await renderSSR(AddRowPage);
	expect(counts()).toEqual(['Pen: 10']);
	await addDropAdd();
});
