import { expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import First from './fixtures/component-row-mint.tsrx';
import Second from './fixtures/component-row-branch-mint.tsrx';

// Two page modules with component rows in one document. Each compiled page
// writes its row-minting loader into one unqualified global, so the last module
// evaluated owns the mint and every other page renders its rows against the
// wrong render-data surface.
const cards = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-card]')).map(
		(row) => row.getAttribute('data-card') ?? '',
	);
const toasts = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-toast]')).map(
		(row) => row.getAttribute('data-toast') ?? '',
	);

test('CSR: the first page mints its own rows with a second page module loaded', async () => {
	const first = await render(First);
	(first.container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => cards(first.container)).toEqual(['north', 'south', 'east']);
	await cleanup();
});

test('CSR: the second page mints its own rows', async () => {
	const second = await render(Second);
	(second.container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => toasts(second.container)).toEqual(['north', 'south', 'east']);
	await cleanup();
});

// The resumed ordering a client-routed app hits: page A resumes, page B resumes
// and takes the global, then A is visited again off its already-evaluated module.
test('SSR: a page still mints after another page module took the global', async () => {
	const warm = await renderSSR(First);
	(warm.container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => cards(warm.container)).toEqual(['north', 'south', 'east']);
	await cleanup();

	const other = await renderSSR(Second);
	(other.container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => toasts(other.container)).toEqual(['north', 'south', 'east']);
	await cleanup();

	const again = await renderSSR(First);
	(again.container.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => cards(again.container)).toEqual(['north', 'south', 'east']);
	await cleanup();
});
