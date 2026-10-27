import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ObjectAssignPage from './object-assign-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
async function expectTracked(): Promise<void> {
	await press('[data-assign]');
	await expect.poll(() => text('[data-name]')).toBe('Q L');
	await press('[data-assign-many]');
	await expect.poll(() => text('[data-name]')).toBe('R T');
	await press('[data-assign-row]');
	await expect.poll(() => text('[data-label]')).toBe('deux');
}

test('CSR: Object.assign onto state or onto a row found in state updates the page', async () => {
	await render(ObjectAssignPage);
	await expectTracked();
});

test('SSR: Object.assign onto state or onto a row found in state updates the page', async () => {
	await renderSSR(ObjectAssignPage);
	await expectTracked();
});
