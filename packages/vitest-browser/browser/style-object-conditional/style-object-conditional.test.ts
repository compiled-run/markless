import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { Rows } from './rows.tsrx';
import { Search } from './search.tsrx';
import { holdSearches } from './search-fruit.ts';

// A style object value may be any expression: a conditional over state, an arm const, a row item, or the @catch error.
afterEach(() => cleanup());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(input: HTMLInputElement, text: string) {
	for (const character of text) {
		input.value += character;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await sleep(150);
	}
}

async function exerciseRows(container: HTMLElement) {
	const styles = () =>
		[...container.querySelectorAll('li')].map((row) => row.getAttribute('style'));
	expect(styles()).toEqual(['font-weight:700;color:red;', 'font-weight:400;color:black;']);
	container.querySelector('button')!.click();
	await expect
		.poll(styles)
		.toEqual(['font-weight:400;color:black;', 'font-weight:700;color:red;']);
}

async function exerciseSearch(container: HTMLElement) {
	const list = () => container.querySelector('ul');
	const weights = () => [...container.querySelectorAll('li')].map((row) => row.style.fontWeight);
	await expect.poll(() => container.querySelectorAll('li').length, { timeout: 5_000 }).toBe(7);
	expect(list()?.style.opacity).toBe('1');
	expect(list()?.style.transition).toBe('opacity 150ms');
	expect(weights()).toEqual(['700', '400', '400', '400', '400', '400', '400']);
	(container.querySelectorAll('li')[1] as HTMLElement).click();
	await expect.poll(weights).toEqual(['400', '700', '400', '400', '400', '400', '400']);

	const release = holdSearches();
	await type(container.querySelector('input')!, 'ap');
	await expect.poll(() => list()?.style.opacity, { timeout: 5_000 }).toBe('0.5');
	release();
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('appleapricotgrape');
	await expect.poll(() => [list()?.style.opacity, ...weights()]).toEqual(['1', '400', '700', '400']);

	const input = container.querySelector('input')!;
	input.value = '';
	await type(input, 'berry!');
	await expect
		.poll(() => container.querySelector('p')?.textContent, { timeout: 5_000 })
		.toBe('Search is down');
	expect(container.querySelector('p')?.style.background).toBe('rgba(220, 38, 38, 0.4)');
	[...container.querySelectorAll('button')]
		.find((button) => button.textContent === 'Try again')!
		.click();
	await expect.poll(() => list()?.textContent, { timeout: 5_000 }).toBe('blueberry');
	await expect.poll(() => list()?.style.opacity).toBe('1');
}

test('CSR: a style object over a row item and state follows the state', async () => {
	await exerciseRows((await render(Rows)).container as HTMLElement);
});

test('SSR: a style object over a row item and state follows the state after resume', async () => {
	await exerciseRows((await renderSSR(Rows)).container as HTMLElement);
});

test('CSR: style objects in @try, its rows and @catch follow the search', async () => {
	await exerciseSearch((await render(Search)).container as HTMLElement);
});

test('SSR: style objects in @try, its rows and @catch follow the search after resume', async () => {
	await exerciseSearch((await renderSSR(Search)).container as HTMLElement);
});
