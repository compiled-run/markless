import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Dashboard from './dashboard.tsrx';
import Page from './page.tsrx';
import { releaseAnswers, resetAnswers } from './answers.ts';

// Several sibling @try blocks in one component, each with an @if or a list, mounted directly and inside a parent.
afterEach(() => {
	cleanup();
	resetAnswers();
});

const poll = { timeout: 2_000 };
// Each look releases whatever answers are waiting, so a read that starts late is answered too.
const answered = <Value>(read: () => Value) => () => (releaseAnswers(), read());
const text = (selector: string) => answered(() => document.querySelector(selector)?.textContent?.trim() ?? null);
const rows = answered(() => Array.from(document.querySelectorAll('[data-rows] li'), (row) => row.textContent));
const more = () => userEvent.click(document.querySelector<HTMLElement>('[data-more]')!);

async function eachBlockFollowsItsAnswer() {
	await expect.poll(answered(() => document.querySelector('[data-loading]')), poll).toBe(null);
	await expect.poll(text('[data-alpha]'), poll).toBe('alpha 1');
	expect(text('[data-beta]')()).toBe('beta 1');
	expect(rows()).toEqual(['row x']);

	await more();
	await expect.poll(text('[data-alpha]'), poll).toBe('alpha 2');
	await expect.poll(text('[data-beta]'), poll).toBe('none');
	await expect.poll(rows, poll).toEqual(['row x', 'row y']);

	await more();
	await expect.poll(text('[data-alpha]'), poll).toBe('alpha 3');
	await expect.poll(text('[data-beta]'), poll).toBe('beta 3');
	await expect.poll(rows, poll).toEqual(['row x', 'row y', 'row z']);
}

test('CSR: each @try settles and follows its own re-fetch', async () => {
	await render(Dashboard);
	await eachBlockFollowsItsAnswer();
});

test('SSR: the same on a resumed page', async () => {
	await renderSSR(Dashboard);
	await eachBlockFollowsItsAnswer();
});

test('CSR: the same inside a parent component', async () => {
	await render(Page);
	await eachBlockFollowsItsAnswer();
});

test('SSR: the same inside a parent component on a resumed page', async () => {
	await renderSSR(Page);
	await eachBlockFollowsItsAnswer();
});
