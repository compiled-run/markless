import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './pd-page.tsrx';

// A derive two modules down reads a prop its composer only passed through, so the page answers that slot.
afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;

async function bumpAndRead() {
	expect(text('[data-base]')).toBe('101');
	expect(text('[data-total]')).toBe('102');
	document.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	await expect.poll(() => text('[data-total]')).toBe('104');
	expect(text('[data-base]')).toBe('102');
}

test('CSR: a derive reading a passed-through prop renders and refreshes', async () => {
	await render(Page);
	await bumpAndRead();
});

test('SSR: a derive reading a passed-through prop resumes and refreshes', async () => {
	await renderSSR(Page);
	await bumpAndRead();
});
