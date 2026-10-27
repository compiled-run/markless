import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ShadowedNamesPage from './shadowed-names-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);

async function expectLocalWritesStayLocal(): Promise<void> {
	await press('[data-shadow-alias]');
	await expect.poll(() => text('[data-log]')).toBe('changed');
	expect(text('[data-profile]')).toBe('p');
	await press('[data-shadow-state]');
	await expect.poll(() => text('[data-log]')).toBe('changedq');
	expect(text('[data-first]')).toBe('Ada');
	await press('[data-shadow-param]');
	await expect.poll(() => text('[data-log]')).toBe('changedq6');
	expect(text('[data-total]')).toBe('0');
	await press('[data-destructure]');
	await expect.poll(() => text('[data-profile]')).toBe('w');
}

test('CSR: a handler local that shadows state or an alias writes only itself', async () => {
	await render(ShadowedNamesPage);
	await expectLocalWritesStayLocal();
});

test('SSR: a handler local that shadows state or an alias writes only itself', async () => {
	await renderSSR(ShadowedNamesPage);
	await expectLocalWritesStayLocal();
});
