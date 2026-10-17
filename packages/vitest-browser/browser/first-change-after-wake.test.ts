import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import Absent from './fixtures/first-change-absent.tsrx';
import Rows from './fixtures/first-change-rows.tsrx';

// The page has not woken before the gesture: the first state change is the one that wakes it.
afterEach(() => cleanup());

test('SSR: the first click that removes an attribute removes it', async () => {
	const screen = await renderSSR(Absent);
	const contents = screen.container.querySelector<HTMLElement>('[data-contents]')!;
	const titled = screen.container.querySelector<HTMLElement>('[data-titled]')!;
	expect(contents.getAttribute('style')).toBe('display: none;');

	await userEvent.click(screen.container.querySelector<HTMLButtonElement>('[data-toggle]')!);
	await expect.poll(() => contents.hasAttribute('style')).toBe(false);
	expect(titled.hasAttribute('title')).toBe(false);

	await userEvent.click(screen.container.querySelector<HTMLButtonElement>('[data-toggle]')!);
	await expect.poll(() => contents.getAttribute('style')).toBe('display: none;');
	expect(titled.getAttribute('title')).toBe('closed');
});

test('SSR: the first keystroke updates a keyed list', async () => {
	const screen = await renderSSR(Rows);
	const items = () =>
		[...screen.container.querySelectorAll('[data-results] li')].map((item) => item.textContent);
	expect(items()).toEqual(['foo', 'bar', 'baz']);

	await userEvent.type(screen.container.querySelector<HTMLInputElement>('[data-search]')!, 'b');
	await expect.poll(items).toEqual(['bar', 'baz']);

	await userEvent.type(screen.container.querySelector<HTMLInputElement>('[data-search]')!, 'a');
	await expect.poll(items).toEqual(['bar', 'baz']);
	await userEvent.type(screen.container.querySelector<HTMLInputElement>('[data-search]')!, 'z');
	await expect.poll(items).toEqual(['baz']);
});
