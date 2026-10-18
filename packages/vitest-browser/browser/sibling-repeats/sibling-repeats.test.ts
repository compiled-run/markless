import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './sr-page.tsrx';

afterEach(cleanup);

const rows = (selector: string) =>
	[...document.querySelectorAll(selector)].map((row) => row.textContent?.replace(/\s+/g, ''));
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinEveryListFollows() {
	click('[data-refill]');
	await expect.poll(() => rows('[data-local-row]')).toEqual(['kopen', 'mshut']);
	await expect.poll(() => rows('[data-inline-row]')).toEqual(['kopen', 'mshut']);
	await expect.poll(() => rows('[data-imported-row]')).toEqual(['kopen', 'mshut']);
	expect(document.querySelector('[data-after-branch]')!.lastElementChild!.hasAttribute('data-end')).toBe(true);
	click('[data-banner]');
	await expect.poll(() => document.querySelector('[data-notice]')).not.toBeNull();
	click('[data-shrink]');
	await expect.poll(() => rows('[data-imported-row]')).toEqual(['mopen']);
	await expect.poll(() => rows('[data-inline-row]')).toEqual(['mopen']);
	expect(document.querySelector('[data-after-branch]')!.lastElementChild!.hasAttribute('data-end')).toBe(true);
	const picks = () => [...document.querySelectorAll('[data-picks] > li')].map((row) => row.textContent?.trim());
	expect(picks()).toEqual(['pick', 'notice', 'none', 'tail']);
	click('[data-pick]');
	await expect.poll(picks).toEqual(['pick', 'notice', 'p', 'tail']);
	click('[data-pick]');
	await expect.poll(picks).toEqual(['pick', 'notice', 'none', 'tail']);
}

test('CSR: a keyed list after another list or a branch in the same parent follows its collection', async () => {
	await render(Page);
	await pinEveryListFollows();
});

test('SSR: a keyed list after another list or a branch in the same parent follows its collection', async () => {
	await renderSSR(Page);
	await pinEveryListFollows();
});
