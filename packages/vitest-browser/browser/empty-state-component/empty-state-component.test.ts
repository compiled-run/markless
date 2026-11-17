import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ShelfPage from './shelf-page.tsrx';

// The empty state lists.mdx recommends when it needs a component: an @if beside the list.
afterEach(cleanup);

const shown = () => [...document.querySelectorAll('ul li')].map((item) => item.textContent?.trim()).join(' | ');
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinEmptyState() {
	expect(shown()).toBe('Dune | Emma');
	click('[data-take]');
	await expect.poll(shown).toBe('Emma');
	click('[data-take]');
	await expect.poll(shown).toBe('No books left.');
	click('[data-add]');
	await expect.poll(shown).toBe('Ulysses');
}

test('CSR: an @if beside a list shows a component once the list is empty and hides it again', async () => {
	await render(ShelfPage);
	await pinEmptyState();
});

test('SSR resume: an @if beside a list shows a component once the list is empty and hides it again', async () => {
	await renderSSR(ShelfPage);
	await pinEmptyState();
});
