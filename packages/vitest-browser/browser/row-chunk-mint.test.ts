import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { App } from './fixtures/row-chunk-mint.tsrx';
import { Shelf } from './fixtures/row-chunk-mint-switch.tsrx';

afterEach(cleanup);

const rows = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-row]')).map((row) => {
		const counter = row.querySelector('.counter');
		return `${row.getAttribute('data-row')}=${counter ? `${counter.querySelector('.label')?.textContent}:${counter.querySelector('.count')?.textContent}` : row.querySelector('.gap') ? 'gap' : '?'}`;
	});
const counterIn = (container: Element, key: string) =>
	container.querySelector(`[data-row="${key}"] button.count`) as HTMLButtonElement;
const click = (container: Element, selector: string) =>
	(container.querySelector(selector) as HTMLElement).click();

async function expectNewRowsPickTheirArm(container: Element) {
	expect(rows(container)).toEqual(['north=North:0', 'gap-1=gap']);

	click(container, '[data-add]');
	await expect.poll(() => rows(container)).toEqual([
		'north=North:0',
		'gap-1=gap',
		'east=East:0',
		'gap-2=gap',
	]);

	// The component a new row's arm placed runs with its own state and handler.
	counterIn(container, 'east').click();
	await expect.poll(() => rows(container)).toContain('east=East:1');
	expect(rows(container)).toContain('north=North:0');
	counterIn(container, 'north').click();
	await expect.poll(() => rows(container)).toContain('north=North:1');
	expect(rows(container)).toContain('east=East:1');

	click(container, '[data-drop]');
	await expect.poll(() => rows(container)).toEqual(['gap-1=gap', 'east=East:1', 'gap-2=gap']);
}

test('CSR: a row the server never sent renders the arm its own item picks', async () => {
	const screen = await render(App);
	await expectNewRowsPickTheirArm(screen.container);
});

test('SSR: a row added after resume renders the arm its own item picks', async () => {
	const screen = await renderSSR(App);
	await expectNewRowsPickTheirArm(screen.container);
});

const books = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-book]')).map(
		(book) =>
			`${book.getAttribute('data-book')}:${book.firstElementChild?.tagName.toLowerCase()}:${book.firstElementChild?.textContent}:${book.querySelector('.tag')?.textContent}`,
	);

test('CSR: a @switch row picks its case for rows added before and after the served ones', async () => {
	const screen = await render(Shelf);
	expect(books(screen.container)).toEqual(['1:strong:Dune:#1']);
	click(screen.container, '[data-more]');
	await expect.poll(() => books(screen.container)).toEqual([
		'2:small:Emma:#2',
		'1:strong:Dune:#1',
		'3:i:Ulysses:#3',
	]);
});

test('SSR: a @switch row picks its case for rows added before and after the served ones', async () => {
	const screen = await renderSSR(Shelf);
	expect(books(screen.container)).toEqual(['1:strong:Dune:#1']);
	click(screen.container, '[data-more]');
	await expect.poll(() => books(screen.container)).toEqual([
		'2:small:Emma:#2',
		'1:strong:Dune:#1',
		'3:i:Ulysses:#3',
	]);
});
