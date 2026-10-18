import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './atj-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;

const shown = () =>
	JSON.stringify([
		text('[data-async-first]'),
		text('[data-state-first]'),
		document.querySelector('[data-attr]')?.getAttribute('title'),
	]);

async function pinJoinedText() {
	await expect.poll(shown).toBe(JSON.stringify(['Inbox 0', '0 in Inbox', 'Inbox 0']));
	const painted = [...document.querySelectorAll('section p')];
	document.querySelector<HTMLElement>('[data-count]')!.click();
	await expect.poll(shown).toBe(JSON.stringify(['Inbox 1', '1 in Inbox', 'Inbox 1']));
	document.querySelector<HTMLElement>('[data-count]')!.click();
	await expect.poll(shown).toBe(JSON.stringify(['Inbox 2', '2 in Inbox', 'Inbox 2']));
	expect(painted.map((element) => element.isConnected)).toEqual(painted.map(() => true));
}

test('CSR: an async value and state joined in one run of text inside @try both update', async () => {
	await render(Page);
	await pinJoinedText();
});

test('SSR: an async value and state joined in one run of text inside @try both update', async () => {
	await renderSSR(Page);
	await pinJoinedText();
});
