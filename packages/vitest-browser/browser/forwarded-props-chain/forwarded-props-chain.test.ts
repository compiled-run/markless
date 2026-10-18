import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedPage from './fpc-imported-page.tsrx';
import Page from './fpc-page.tsrx';
import StatePage from './fpc-state-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const next = () => document.querySelector<HTMLElement>('[data-next]')!.click();

async function pinComputedSource() {
	expect(text('[data-outer] p')).toBe('none');
	next();
	await expect.poll(() => text('[data-direct] p')).toBe('got v1');
	await expect.poll(() => text('[data-outer] p')).toBe('got v1');
	next();
	await expect.poll(() => text('[data-outer] p')).toBe('got v2');
}

async function pinStateSource() {
	expect([text('i'), text('b')]).toEqual(['0', 'got 0']);
	next();
	await expect.poll(() => [text('i'), text('b')]).toEqual(['01', 'got 01']);
	next();
	await expect.poll(() => [text('i'), text('b')]).toEqual(['011', 'got 011']);
}

test('CSR: a computed forwarded through a second component reaches the inner computed', async () => {
	await render(Page);
	await pinComputedSource();
});

test('SSR: a computed forwarded through a second component reaches the inner computed', async () => {
	await renderSSR(Page);
	await pinComputedSource();
});

test('CSR: state forwarded through a second same-module component reaches text and computed', async () => {
	await render(StatePage);
	await pinStateSource();
});

test('SSR: state forwarded through a second same-module component reaches text and computed', async () => {
	await renderSSR(StatePage);
	await pinStateSource();
});

test('SSR: state forwarded through an imported pair of components still follows', async () => {
	await renderSSR(ImportedPage);
	await pinStateSource();
});
