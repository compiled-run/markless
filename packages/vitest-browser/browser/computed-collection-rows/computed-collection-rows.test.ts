import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './ccr-page.tsrx';

// The calendar's grid, reduced: a 42-key collection COMPUTED off a month cell,
// with rows that are a component rather than a template. A page key writes the
// month and then, on its next statement, reads the plural element() handle and
// focuses the day it just wrote. Every assertion below reads the handler's own
// in-handler answer (`landed`, `rows-seen`) and `document.activeElement` after
// the write is visible - polling on focus itself would pass on a retry loop.

afterEach(async () => {
	await cleanup();
});

const days = () =>
	[...document.querySelectorAll<HTMLButtonElement>('[data-ccr-item]')];
const dayAt = (iso: string) => days().find((day) => day.getAttribute('value') === iso);
const title = () => document.querySelector('[data-ccr-title]')?.textContent;
const landed = () => document.querySelector('[data-ccr-landed]')?.textContent;
const rowsSeen = () => document.querySelector('[data-ccr-rows-seen]')?.textContent;

async function pageDownFrom(iso: string): Promise<void> {
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);
	dayAt(iso)!.focus();
	await userEvent.keyboard('{PageDown}');
	await expect.poll(title, { timeout: 5000 }).toBe('2026-09');
}

// Red until a component row can be built synchronously at the write (its html comes from an async render path).
test.fails('CSR: a page key across a computed-backed month lands focus on the day it wrote', async () => {
	await render(Page);

	await pageDownFrom('2026-08-14');

	expect(landed()).toBe('found');
	expect(rowsSeen()).toBe('42:2026-08-30');
	expect(document.activeElement).toBe(dayAt('2026-09-14'));
});

test.fails('SSR: a page key across a computed-backed month lands focus on the day it wrote', async () => {
	await renderSSR(Page);

	await pageDownFrom('2026-08-14');

	expect(landed()).toBe('found');
	expect(rowsSeen()).toBe('42:2026-08-30');
	expect(document.activeElement).toBe(dayAt('2026-09-14'));
});

test('CSR: the handler reads the rewritten 42 keys off the plural handle', async () => {
	await render(Page);

	await pageDownFrom('2026-08-14');

	// The September grid opens on 2026-08-30; the August one opened on 2026-07-26.
	expect(days().map((day) => day.getAttribute('value'))[0]).toBe('2026-08-30');
	expect(days().length).toBe(42);
	expect(dayAt('2026-09-14')!.getAttribute('tabindex')).toBe('0');
	expect(days().filter((day) => day.getAttribute('tabindex') === '0').length).toBe(1);
});

test('SSR: the handler reads the rewritten 42 keys off the plural handle', async () => {
	await renderSSR(Page);

	await pageDownFrom('2026-08-14');

	expect(days().map((day) => day.getAttribute('value'))[0]).toBe('2026-08-30');
	expect(days().length).toBe(42);
	expect(dayAt('2026-09-14')!.getAttribute('tabindex')).toBe('0');
	expect(days().filter((day) => day.getAttribute('tabindex') === '0').length).toBe(1);
});

test.fails('CSR: a second crossing keeps the tab stop with the keyboard', async () => {
	await render(Page);

	await pageDownFrom('2026-08-14');
	await userEvent.keyboard('{PageDown}');
	await expect.poll(title, { timeout: 5000 }).toBe('2026-10');

	expect(landed()).toBe('found');
	expect(document.activeElement).toBe(dayAt('2026-10-14'));
});

test.fails('SSR: a second crossing keeps the tab stop with the keyboard', async () => {
	await renderSSR(Page);

	await pageDownFrom('2026-08-14');
	await userEvent.keyboard('{PageDown}');
	await expect.poll(title, { timeout: 5000 }).toBe('2026-10');

	expect(landed()).toBe('found');
	expect(document.activeElement).toBe(dayAt('2026-10-14'));
});
