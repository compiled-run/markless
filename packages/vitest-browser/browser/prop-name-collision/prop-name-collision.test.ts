import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './pnc-page.tsrx';

// A component handing its child a value under one of its own prop names keeps reading its own prop.
afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const attribute = (selector: string, name: string) =>
	document.querySelector(selector)?.getAttribute(name);

async function pin() {
	document.querySelector<HTMLElement>('[data-toggle]')!.click();
	await expect.poll(() => text('[data-dock]')).toBe('BOTTOM');
	await expect.poll(() => attribute('[data-details]', 'class')).toBe('row');
	await expect.poll(() => text('[data-badge]')).toBe('badge BOTTOM');
	await expect.poll(() => text('[data-level]')).toBe('2');
	await expect.poll(() => attribute('[data-gauge]', 'title')).toBe('left:4');
	document.querySelector<HTMLElement>('[data-toggle]')!.click();
	await expect.poll(() => text('[data-badge]')).toBe('badge RIGHT');
	await expect.poll(() => text('[data-level]')).toBe('3');
}

test('CSR: a prop name a component reuses for its child follows the parent', async () => {
	await render(Page);
	await pin();
});

test('SSR: a prop name a component reuses for its child follows the parent', async () => {
	await renderSSR(Page);
	await pin();
});
