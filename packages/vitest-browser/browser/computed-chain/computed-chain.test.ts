import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './cc-page.tsrx';

afterEach(cleanup);

const items = () => [...document.querySelectorAll('[data-window] li')].map((li) => li.textContent);
const text = (selector: string) => document.querySelector(selector)?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// `shown` and `ordered` are read only by other computeds, so the server sends no value for them.
async function pinChainFollows() {
	expect(items()).toEqual(['1', '2']);
	expect(text('[data-label]')).toBe('1-2');
	click('[data-down]');
	await expect.poll(items).toEqual(['2', '3']);
	await expect.poll(() => text('[data-label]')).toBe('2-3');
	click('[data-flip]');
	await expect.poll(items).toEqual(['2', '1']);
	await expect.poll(() => text('[data-label]')).toBe('2-1');
	click('[data-peek]');
	await expect.poll(() => text('[data-seen]')).toBe('2,1');
}

test('CSR: a computed that reads another computed follows both', async () => {
	await render(Page);
	await pinChainFollows();
});

test('SSR: a computed that reads another computed follows both after resume', async () => {
	await renderSSR(Page);
	await pinChainFollows();
});
