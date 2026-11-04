import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import NormalizePage from './normalize-page.tsrx';
import RegistryPage from './registry-page.tsrx';
import RenamePage from './rename-page.tsrx';
import RowsPage from './rows-page.tsrx';
import StartedPage from './started-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function renameAndPush() {
	expect(text('[data-o]')).toBe('Ada');
	press('[data-rename]');
	await expect.poll(() => text('[data-o]')).toBe('Cy');
	press('[data-add]');
	await expect.poll(() => text('[data-n]')).toBe('2');
}

async function renameAfterAnotherWrite() {
	press('[data-n]');
	await expect.poll(() => text('[data-n]')).toBe('1');
	press('[data-rename]');
	await expect.poll(() => text('[data-o]')).toBe('Cy');
	press('[data-rename2]');
	await expect.poll(() => text('[data-o]')).toBe('Di');
}

async function libraryNormalizes() {
	expect(text('[data-o]')).toBe('[ Ada@X.io ]');
	press('[data-b]');
	await expect.poll(() => text('[data-o]')).toBe('[ada@x.io]');
}

async function registryRuns() {
	expect(text('[data-o]')).toBe('0');
	press('[data-run]');
	await expect.poll(() => text('[data-o]')).toBe('1');
	press('[data-run]');
	await expect.poll(() => text('[data-o]')).toBe('2');
}

test('CSR: an imported .ts helper that writes a property of the state it is passed updates the page', async () => {
	await render(RenamePage);
	await renameAndPush();
});

test('SSR: an imported .ts helper that writes a property of the state it is passed updates the page', async () => {
	await renderSSR(RenamePage);
	await renameAndPush();
});

test('CSR: an imported .ts helper write lands after the page already handled another write', async () => {
	await render(StartedPage);
	await renameAfterAnotherWrite();
});

test('SSR: an imported .ts helper write lands after the page already handled another write', async () => {
	await renderSSR(StartedPage);
	await renameAfterAnotherWrite();
});

test('CSR: a library function that mutates the state it is passed updates the page', async () => {
	await render(NormalizePage);
	await libraryNormalizes();
});

test('SSR: a library function that mutates the state it is passed updates the page', async () => {
	await renderSSR(NormalizePage);
	await libraryNormalizes();
});

test('CSR: a function looked up at run time that mutates the state it is passed updates the page', async () => {
	await render(RegistryPage);
	await registryRuns();
});

test('SSR: a function looked up at run time that mutates the state it is passed updates the page', async () => {
	await renderSSR(RegistryPage);
	await registryRuns();
});

const taskState = (id: string) =>
	document.querySelector(`[data-task="${id}"] span`)?.textContent ?? null;

async function rowsAndNestedPaths() {
	expect([taskState('t1'), taskState('t2')]).toEqual(['open', 'open']);
	document.querySelector<HTMLElement>('[data-task="t2"] button')!.click();
	await expect.poll(() => [taskState('t1'), taskState('t2')]).toEqual(['open', 'done']);
	press('[data-retitle]');
	await expect.poll(() => text('[data-title]')).toBe('month');
	press('[data-show]');
	await expect.poll(() => text('[data-shown]')).toBe('MONTH');
	document.querySelector<HTMLElement>('[data-task="t1"] [data-archive]')!.click();
	await expect.poll(() => document.querySelectorAll('[data-task]').length).toBe(1);
	expect(taskState('t2')).toBe('done');
}

test('CSR: a helper handed a row item or a nested path updates that row and that path', async () => {
	await render(RowsPage);
	await rowsAndNestedPaths();
});

test('SSR: a helper handed a row item or a nested path updates that row and that path', async () => {
	await renderSSR(RowsPage);
	await rowsAndNestedPaths();
});
