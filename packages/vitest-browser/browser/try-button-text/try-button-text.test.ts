import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './tbt-page.tsrx';

afterEach(cleanup);

const button = () => document.querySelector<HTMLElement>('[data-try-button]');

async function pinBothHolesKept() {
	await expect.poll(() => button()?.textContent).toBe('Inbox 0');
	button()!.click();
	await expect.poll(() => button()?.textContent).toBe('Inbox 1');
	button()!.click();
	await expect.poll(() => button()?.textContent).toBe('Inbox 2');
}

test('CSR: an async value in its own element beside a state hole in an @try arm survives a click', async () => {
	await render(Page);
	await pinBothHolesKept();
});

test('SSR: an async value in its own element beside a state hole in an @try arm survives a click', async () => {
	await renderSSR(Page);
	await pinBothHolesKept();
});
