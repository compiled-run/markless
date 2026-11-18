import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';
import { releaseAnswers, resetAnswers } from './answers.ts';

// A prop read off an async value whose first key is also a snapshot field name (`status`) passes the value's field.
afterEach(() => {
	cleanup();
	resetAnswers();
});

const poll = { timeout: 2_000 };
const badge = () => (releaseAnswers(), document.querySelector('[data-badge]')?.textContent?.trim() ?? null);

async function badgeFollowsTheValue() {
	await expect.poll(badge, poll).toBe('shipped');
	await userEvent.click(document.querySelector<HTMLElement>('[data-more]')!);
	await expect.poll(badge, poll).toBe('packed');
	await userEvent.click(document.querySelector<HTMLElement>('[data-more]')!);
	await expect.poll(badge, poll).toBe('shipped');
}

test('CSR: the child shows the value field, not the snapshot status', async () => {
	await render(Page);
	await badgeFollowsTheValue();
});

test('SSR: the same on a resumed page', async () => {
	await renderSSR(Page);
	await badgeFollowsTheValue();
});
