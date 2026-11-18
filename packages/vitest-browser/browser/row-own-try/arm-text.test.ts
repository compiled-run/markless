import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import { forgetRequests } from './gate.ts';
import RowMarkPage from './row-mark-page.tsrx';
import { appendStreamed, counts, own, settleInline } from './rows.ts';

// Text in a keyed row's @try arm that reads the row's item beside page state follows a write, each row with its own item.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const marks = () => [...document.querySelectorAll('[data-mark]')].map((cell) => cell.textContent);
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function markThenRefresh() {
	press('[data-mark-up]');
	await expect.poll(marks).toEqual(['Pen #2', 'Ink #2']);
	expect(counts()).toEqual(own);
	press('[data-again]');
	await settleInline(1);
	expect(marks()).toEqual(['Nib #2', 'Cap #2']);
	press('[data-mark-up]');
	await expect.poll(marks).toEqual(['Nib #4', 'Cap #4']);
}

test('CSR: row @try text reading the row and page state follows a write, and after a refresh too', async () => {
	await render(RowMarkPage);
	await settleInline(0);
	await markThenRefresh();
});

test('SSR: row @try text reading the row and page state follows a write, and after a refresh too', async () => {
	await renderSSR(RowMarkPage);
	expect(marks()).toEqual(['Pen #0', 'Ink #0']);
	await markThenRefresh();
});

test('streamed: row @try text reading the row and page state follows a write, and after a refresh too', async () => {
	const { shell, appends } = await renderStream(RowMarkPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(marks).toEqual(['Pen #0', 'Ink #0']);
	await markThenRefresh();
});
