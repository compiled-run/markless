import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import RekeyPage from './rekey-page.tsrx';

// Re-keying a one-row @for whose row holds a bare-@try child starts the row over: the old row goes, the new one loads.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const texts = (selector: string) => [...document.querySelectorAll(selector)].map((node) => node.textContent);

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function startsOver() {
	document.querySelector<HTMLElement>('[data-next]')!.click();
	await expect.poll(() => texts('[data-chapter-loading]')).toEqual(['Loading…']);
	expect(texts('[data-label]')).toEqual([]);
	await reply('chapter:2');
	await expect.poll(() => texts('[data-label]')).toEqual(['Chapter 2 of 4']);
	expect(texts('[data-line]')).toEqual(['line of 2']);
	expect(texts('[data-chapter-loading]')).toEqual([]);
	expect(document.querySelectorAll('[data-holder]')).toHaveLength(1);
}

test('CSR: re-keying a one-row list replaces the old row and shows the new answer', async () => {
	await render(RekeyPage);
	await reply('chapter:1');
	await expect.poll(() => texts('[data-label]')).toEqual(['Chapter 1 of 4']);
	await startsOver();
});

test('SSR: re-keying a one-row list replaces the old row and shows the new answer after resume', async () => {
	await renderSSR(RekeyPage);
	expect(texts('[data-label]')).toEqual(['Chapter 1 of 4']);
	await startsOver();
});
