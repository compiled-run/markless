import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { holdSearches, releaseSearches } from './search-fruit.ts';
import { Search } from './search.tsrx';

// An aria-busy the author binds is theirs: busy marks never strip or overwrite it, while marks on unbound readers still clear.
afterEach(() => {
	releaseSearches();
	cleanup();
});

function search(container: HTMLElement, text: string) {
	const input = container.querySelector('input')!;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function exercise(container: HTMLElement) {
	const list = () => container.querySelector('ol');
	const count = () => container.querySelector('[data-count]');
	const looks = () => [list()?.getAttribute('aria-busy') ?? null, list()?.style.opacity];
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	search(container, 'a');
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotbananagrapemango');
	await expect.poll(looks).toEqual(['false', '1']);

	const release = holdSearches();
	search(container, 'ap!');
	await expect.poll(looks, { timeout: 5_000 }).toEqual(['true', '0.5']);
	await expect.poll(() => count()?.getAttribute('aria-busy'), { timeout: 5_000 }).toBe('true');
	release();
	await expect.poll(() => container.querySelector('[data-error]')?.textContent, { timeout: 5_000 }).toBe('Search is down');
	expect(list()?.textContent).toBe('appleapricotbananagrapemango');
	await expect.poll(() => count()?.hasAttribute('aria-busy')).toBe(false);
	expect(looks()).toEqual(['true', '0.5']);

	search(container, 'gr');
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('grape');
	await expect.poll(looks).toEqual(['false', '1']);
	expect(count()?.hasAttribute('aria-busy')).toBe(false);
}

test('CSR: a failed refresh leaves the author-bound aria-busy true over the dimmed list', async () => {
	const screen = await render(Search);
	await exercise(screen.container as HTMLElement);
});

test('SSR: a failed refresh leaves the author-bound aria-busy true over the dimmed list after resume', async () => {
	const screen = await renderSSR(Search);
	await exercise(screen.container as HTMLElement);
});
