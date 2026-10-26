import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './trh-page.tsrx';
import Repro from './trh-repro.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const rowTexts = () => [...document.querySelectorAll('[data-row]')].map((row) => row.textContent);
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function clickEachRow(expected: ReadonlyArray<string>) {
	await expect.poll(rowTexts).toEqual(expected);
	for (const [index, label] of expected.entries()) {
		document.querySelectorAll<HTMLElement>('[data-row]')[index]!.click();
		await expect.poll(() => text('[data-picked]')).toBe(`picked ${label}`);
	}
}

async function rowsFlow() {
	await clickEachRow(['row 0', 'row 1']);
	click('[data-more]');
	await clickEachRow(['row 0', 'row 1', 'row 2']);
	click('[data-more]');
	await clickEachRow(['row 0', 'row 1', 'row 2', 'row 3']);
	click('[data-reverse]');
	await clickEachRow(['row 3', 'row 2', 'row 1', 'row 0']);
}

test('CSR: rows a re-settled @try adds and reorders run their handlers with their own row', async () => {
	await render(Page);
	await rowsFlow();
});

test('SSR: rows a re-settled @try adds and reorders run their handlers with their own row', async () => {
	await renderSSR(Page);
	await rowsFlow();
});

async function reproFlow() {
	await clickEachRow(['row 0', 'row 1']);
	document.querySelector<HTMLElement>('button')!.click();
	await clickEachRow(['row 0', 'row 1', 'row 2']);
}

test('CSR: the palette repro picks the clicked row', async () => {
	await render(Repro);
	await reproFlow();
});

test('SSR: the palette repro picks the clicked row', async () => {
	await renderSSR(Repro);
	await reproFlow();
});
