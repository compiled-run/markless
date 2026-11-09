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

const rowsOf = (container: HTMLElement) =>
	[...container.querySelectorAll('li')].map((row) => [
		row.textContent?.trim(),
		row.getAttribute('data-match'),
		row.getAttribute('data-query'),
	]);

async function exercise(container: HTMLElement) {
	const rows = () => rowsOf(container);
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

// The rows land before their runtime is wired, so a keystroke in between must still repaint them.
test('CSR: a query typed the moment the rows land repaints every row value', async () => {
	const { container } = await render(Page);
	const input = container.querySelector('input')!;
	await new Promise<void>((resolve) => {
		const observer = new MutationObserver(() => {
			if (container.querySelectorAll('li').length !== 7) return;
			observer.disconnect();
			input.value = 'ap';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			resolve();
		});
		observer.observe(container, { subtree: true, childList: true });
	});
	await expect.poll(() => rowsOf(container as HTMLElement), { timeout: 5_000 }).toEqual([
		['apple', 'yes', 'ap'],
		['apricot', 'yes', 'ap'],
		['grape', 'no', 'ap'],
	]);
});

test('CSR: rows rebuilt after a search read the query prop', async () => {
	const screen = await render(Page);
	await exercise(screen.container as HTMLElement);
});

test('SSR: rows rebuilt after a search read the query prop after resume', async () => {
	const screen = await renderSSR(Page);
	await exercise(screen.container as HTMLElement);
});
