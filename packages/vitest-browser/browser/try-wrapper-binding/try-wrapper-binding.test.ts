import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './twb-page.tsrx';
import Repro from './twb-repro.tsrx';

afterEach(cleanup);

const list = () => document.querySelector<HTMLElement>('[data-list]');
const items = () =>
	[...document.querySelectorAll('[data-list] li')].map((item) => item.textContent);
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function wrapperFlow() {
	await expect.poll(() => list()?.hidden).toBe(true);
	click('[data-more]');
	await expect.poll(items).toEqual(['row 0']);
	expect(list()?.hidden).toBe(false);
	click('[data-more]');
	await expect.poll(items).toEqual(['row 0', 'row 1']);
	click('[data-clear]');
	await expect.poll(() => list()?.hidden).toBe(true);
	expect(items()).toEqual([]);
	click('[data-more]');
	await expect.poll(items).toEqual(['row 0']);
	expect(list()?.hidden).toBe(false);
}

test('CSR: a list whose wrapper binds the async value keeps its rows across settles', async () => {
	await render(Page);
	await wrapperFlow();
});

test('SSR: a list whose wrapper binds the async value keeps its rows across settles', async () => {
	await renderSSR(Page);
	await wrapperFlow();
});

async function reproFlow() {
	document.querySelector<HTMLElement>('button')!.click();
	await expect.poll(items).toEqual(['row 0']);
	document.querySelector<HTMLElement>('button')!.click();
	await expect.poll(items).toEqual(['row 0', 'row 1']);
}

test('CSR: the palette repro keeps its rows', async () => {
	await render(Repro);
	await reproFlow();
});

test('SSR: the palette repro keeps its rows', async () => {
	await renderSSR(Repro);
	await reproFlow();
});
