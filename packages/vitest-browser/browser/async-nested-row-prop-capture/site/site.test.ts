import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../../src/index.ts';
import SiteDemo from './demo.tsrx';
import { resetSiteApi, siteSaveCalls } from './api.ts';

beforeEach(resetSiteApi);
afterEach(() => cleanup());

const LOADS = { timeout: 5_000 };

async function loadedTodos(container: HTMLElement): Promise<HTMLElement> {
	await expect.poll(() => container.querySelectorAll('[data-confirmed-row]').length, LOADS).toBe(1);
	return container.querySelector<HTMLElement>('[data-todos]')!;
}

async function runAgain(container: HTMLElement): Promise<HTMLElement> {
	const before = await loadedTodos(container);
	container.querySelector<HTMLButtonElement>('[data-run-again]')!.click();
	await expect.poll(() => container.querySelector('[data-todos]') !== before, LOADS).toBe(true);
	return loadedTodos(container);
}

async function saveIn(todos: HTMLElement, title: string) {
	const input = todos.querySelector('[data-title]') as HTMLInputElement;
	input.value = title;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	todos.querySelector<HTMLButtonElement>('[data-add]')!.click();

	await expect.poll(() => todos.querySelector('[data-saving-row] [data-confirmed]')?.textContent, LOADS).toBe(title);
	expect(todos.querySelector('[data-saving-row] [data-label]')?.textContent).toBe(title.toUpperCase());
	expect(siteSaveCalls().map((call) => call.title)).toEqual([title]);
}

test('CSR: a draft saved inside the first rendered owner row', async () => {
	const container = (await render(SiteDemo)).container as HTMLElement;
	await saveIn(await loadedTodos(container), 'First');
});

test('CSR: a draft saved inside an owner row minted by Run again', async () => {
	const container = (await render(SiteDemo)).container as HTMLElement;
	await saveIn(await runAgain(container), 'Second');
});

test('SSR: a draft saved inside the served owner row', async () => {
	const container = (await renderSSR(SiteDemo)).container as HTMLElement;
	await saveIn(await loadedTodos(container), 'Third');
});

test('SSR: a draft saved inside an owner row minted by Run again after resume', async () => {
	const container = (await renderSSR(SiteDemo)).container as HTMLElement;
	await saveIn(await runAgain(container), 'Fourth');
});
