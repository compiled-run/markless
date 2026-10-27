import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Page } from './page.tsrx';

// A row inside a child's @try reads the prop its parent passes, after the rows are rebuilt in the browser.
afterEach(() => cleanup());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
}

async function exercise(container: HTMLElement) {
	const rows = () =>
		[...container.querySelectorAll('li')].map((row) => [
			row.textContent?.trim(),
			row.getAttribute('data-match'),
			row.getAttribute('data-query'),
		]);
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	expect(rows()[0]).toEqual(['apple', 'yes', '']);
	await type(container.querySelector('input')!, 'ap');
	await expect
		.poll(rows, { timeout: 5_000 })
		.toEqual([
			['apple', 'yes', 'ap'],
			['apricot', 'yes', 'ap'],
			['grape', 'no', 'ap'],
		]);
	await type(container.querySelector('input')!, 'r');
	await expect.poll(rows, { timeout: 5_000 }).toEqual([['apricot', 'yes', 'apr']]);
}

test('CSR: rows rebuilt after a search read the query prop', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: rows rebuilt after a search read the query prop after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
