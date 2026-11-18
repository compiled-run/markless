import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './aria-false/page.tsrx';

// aria-pressed, aria-expanded, aria-checked and the other ARIA states with a "false" value write it: absent means "not a toggle", not "off".

afterEach(cleanup);

const read = (selector: string, names: ReadonlyArray<string>) => {
	const element = document.querySelector(selector);
	return names.map((name) => element?.getAttribute(name) ?? null);
};
const LIVE = ['aria-pressed', 'aria-expanded', 'aria-checked', 'aria-busy', 'aria-hidden'];
const rows = () =>
	[...document.querySelectorAll('[data-row]')].map((row) => row.getAttribute('aria-selected'));

async function ariaFalse() {
	expect(
		read('[data-fixed]', ['aria-pressed', 'aria-expanded', 'aria-hidden', 'data-off']),
	).toEqual(['false', 'false', null, null]);
	expect(read('[data-live]', LIVE)).toEqual(['false', 'false', 'false', 'false', null]);
	expect(rows()).toEqual(['false', 'false']);
	expect(read('[data-object]', ['aria-pressed', 'aria-expanded', 'draggable', 'title'])).toEqual([
		'false',
		'true',
		'false',
		null,
	]);
	expect(read('[data-spread]', ['aria-pressed', 'aria-expanded', 'draggable', 'title'])).toEqual([
		'false',
		'true',
		'false',
		null,
	]);
	expect(read('[data-arm]', ['aria-disabled'])).toEqual(['false']);
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect
		.poll(() => read('[data-live]', LIVE))
		.toEqual(['true', 'true', 'true', 'true', 'true']);
	await expect.poll(rows).toEqual(['true', 'true']);
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect
		.poll(() => read('[data-live]', LIVE))
		.toEqual(['false', 'false', 'false', 'false', null]);
	await expect.poll(rows).toEqual(['false', 'false']);
	await expect.poll(() => read('[data-arm]', ['aria-disabled'])).toEqual(['false']);
}

test('CSR: ARIA states write "false" instead of removing the attribute', async () => {
	await render(Page);
	await ariaFalse();
});
test('SSR resume: ARIA states write "false" on the server and on updates', async () => {
	await renderSSR(Page);
	await ariaFalse();
});
