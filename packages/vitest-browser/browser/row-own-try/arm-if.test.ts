import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import ChildIfPage from './child-if-page.tsrx';
import { forgetRequests } from './gate.ts';
import ItemIfPage from './item-if-page.tsrx';
import RowIfPage from './row-if-page.tsrx';
import { appendStreamed, counts, own, reply, settleInline } from './rows.ts';

// An @if in a keyed row's @try arm opens and closes per row when the state its condition reads is written.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const texts = (selector: string) => [...document.querySelectorAll(selector)].map((cell) => cell.textContent);
const shown = () => ({ open: texts('[data-open]'), shut: texts('[data-shut]'), picked: texts('[data-picked]') });
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function toggleAndPick() {
	press('[data-toggle]');
	await expect.poll(shown).toEqual({ open: ['Pen open', 'Ink open'], shut: [], picked: [] });
	press('[data-pick]');
	await expect.poll(shown).toEqual({ open: ['Pen open', 'Ink open'], shut: [], picked: ['Pen'] });
	press('[data-pick]');
	await expect.poll(shown).toEqual({ open: ['Pen open', 'Ink open'], shut: [], picked: ['Ink'] });
	press('[data-toggle]');
	await expect.poll(shown).toEqual({ open: [], shut: ['Pen shut', 'Ink shut'], picked: ['Ink'] });
	press('[data-again]');
	await settleInline(1);
	press('[data-pick]');
	press('[data-pick]');
	await expect.poll(shown).toEqual({ open: [], shut: ['Nib shut', 'Cap shut'], picked: ['Cap'] });
	press('[data-toggle]');
	await expect.poll(shown).toEqual({ open: ['Nib open', 'Cap open'], shut: [], picked: ['Cap'] });
}

const first = { open: [], shut: ['Pen shut', 'Ink shut'], picked: [] };

test('CSR: an @if in a row @try arm follows the state its condition reads', async () => {
	await render(RowIfPage);
	await settleInline(0);
	expect(shown()).toEqual(first);
	await toggleAndPick();
});

test('SSR: an @if in a row @try arm follows the state its condition reads', async () => {
	await renderSSR(RowIfPage);
	expect(shown()).toEqual(first);
	await toggleAndPick();
});

test('streamed: an @if in a row @try arm follows the state its condition reads', async () => {
	const { shell, appends } = await renderStream(RowIfPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(shown).toEqual(first);
	await toggleAndPick();
});

// A child's rows: an @else if chain testing the child's state against each row's item.
const levels = () => texts('[data-level-row]');

async function levelUp() {
	press('[data-level]');
	await expect.poll(levels).toEqual(['Pen at!', 'Ink below!']);
	press('[data-level]');
	await expect.poll(levels).toEqual(['Pen above!', 'Ink at!']);
	press('[data-again]');
	await settleInline(1);
	expect(levels()).toEqual(['Nib below!', 'Cap below!']);
	press('[data-level]');
	press('[data-level]');
	await expect.poll(levels).toEqual(['Nib above!', 'Cap at!']);
}

test("CSR: an @else if chain in a child's row @try arm follows the child's state", async () => {
	await render(ChildIfPage);
	await settleInline(0);
	expect(levels()).toEqual(['Pen below!', 'Ink below!']);
	await levelUp();
});

test("SSR: an @else if chain in a child's row @try arm follows the child's state", async () => {
	await renderSSR(ChildIfPage);
	expect(levels()).toEqual(['Pen below!', 'Ink below!']);
	await levelUp();
});

test("streamed: an @else if chain in a child's row @try arm follows the child's state", async () => {
	const { shell, appends } = await renderStream(ChildIfPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(levels).toEqual(['Pen below!', 'Ink below!']);
	await levelUp();
});

// Rows over a list state holds: the @if tests a field of the row's own item.
const tasks = () => ({ done: texts('[data-done]'), todo: texts('[data-todo]') });

async function finishInk() {
	press('[data-finish]');
	await expect.poll(tasks).toEqual({ done: ['Ink'], todo: ['Pen'] });
	expect(counts()).toEqual(own);
	press('[data-finish]');
	await expect.poll(tasks).toEqual({ done: [], todo: ['Pen', 'Ink'] });
}

test("CSR: an @if in a row @try arm follows a write to the row's item", async () => {
	await render(ItemIfPage);
	await reply('stock:0');
	await expect.poll(counts).toEqual(own);
	await finishInk();
});

test("SSR: an @if in a row @try arm follows a write to the row's item", async () => {
	await renderSSR(ItemIfPage);
	expect(tasks()).toEqual({ done: [], todo: ['Pen', 'Ink'] });
	await finishInk();
});

test("streamed: an @if in a row @try arm follows a write to the row's item", async () => {
	const { shell, appends } = await renderStream(ItemIfPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(counts).toEqual(own);
	await finishInk();
});
