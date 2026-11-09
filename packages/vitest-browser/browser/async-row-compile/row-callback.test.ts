import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import TallyPage from './tally-page.tsrx';

// A callback prop called from a button inside a child's @try, the child in a keyed one-row @for, runs.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function rowButtonBumps() {
	click('[data-row-next]');
	await expect.poll(() => text('[data-chapter]')).toBe('2');
	await reply('chapter:2');
	await expect.poll(() => text('[data-row-value]')).toBe('2 of 4');
	click('[data-row-next]');
	await expect.poll(() => text('[data-chapter]')).toBe('3');
	await reply('chapter:3');
	await expect.poll(() => text('[data-row-value]')).toBe('3 of 4');
}

test('CSR: the row button inside @try calls the parent callback', async () => {
	await render(TallyPage);
	await reply('chapter:1');
	await expect.poll(() => text('[data-row-value]')).toBe('1 of 4');
	await rowButtonBumps();
});

test('SSR: the row button inside @try calls the parent callback after resume', async () => {
	await renderSSR(TallyPage);
	expect(text('[data-row-value]')).toBe('1 of 4');
	await rowButtonBumps();
});

test('CSR: the parent button re-keys the row and the new row loads its own answer', async () => {
	await render(TallyPage);
	await reply('chapter:1');
	await expect.poll(() => text('[data-row-value]')).toBe('1 of 4');
	click('[data-page-next]');
	await reply('chapter:2');
	await expect.poll(() => text('[data-row-value]')).toBe('2 of 4');
	click('[data-row-next]');
	await expect.poll(() => text('[data-chapter]')).toBe('3');
	await reply('chapter:3');
	await expect.poll(() => text('[data-row-value]')).toBe('3 of 4');
});
