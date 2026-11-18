import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import { forgetRequests } from './gate.ts';
import RestockPage from './restock-page.tsrx';
import { appendStreamed, counts, loading, reply } from './rows.ts';

// A refresh of only the rows' own async value, the list unchanged, leaves no row @try arm text stale.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const texts = (selector: string) => [...document.querySelectorAll(selector)].map((cell) => cell.textContent);
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function markRefillMark() {
	press('[data-mark-up]');
	await expect.poll(() => texts('[data-mark]')).toEqual(['Pen #2', 'Ink #2']);
	press('[data-refill]');
	await reply('restock:1');
	await expect.poll(counts).toEqual(['Pen: 11', 'Ink: 21']);
	expect(texts('[data-mark]')).toEqual(['Pen #2', 'Ink #2']);
	press('[data-mark-up]');
	await expect.poll(() => texts('[data-high]')).toEqual(['Pen 11', 'Ink 21']);
	expect(texts('[data-mark]')).toEqual(['Pen #4', 'Ink #4']);
	expect(counts()).toEqual(['Pen: 11', 'Ink: 21']);
	press('[data-refill]');
	await reply('restock:2');
	await expect.poll(counts).toEqual(['Pen: 12', 'Ink: 22']);
	expect(texts('[data-high]')).toEqual(['Pen 12', 'Ink 22']);
	expect(texts('[data-mark]')).toEqual(['Pen #4', 'Ink #4']);
}

const first = ['Pen: 10', 'Ink: 20'];

test('CSR: a row @try arm refreshed alone shows its new value, and a later write keeps it', async () => {
	await render(RestockPage);
	await reply('items:0');
	await expect.poll(loading).toBe(2);
	await reply('restock:0');
	await expect.poll(counts).toEqual(first);
	await markRefillMark();
});

test('SSR: a row @try arm refreshed alone shows its new value, and a later write keeps it', async () => {
	await renderSSR(RestockPage);
	expect(counts()).toEqual(first);
	await markRefillMark();
});

test('streamed: a row @try arm refreshed alone shows its new value, and a later write keeps it', async () => {
	const { shell, appends } = await renderStream(RestockPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(first);
	await markRefillMark();
});
