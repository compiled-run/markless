import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './fpd-page.tsrx';

afterEach(cleanup);

const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const text = (selector: string) => document.querySelector(selector)?.textContent;

// The stop flag is cleared once dispatch ends, so a stop shows as the window never hearing it.
function press(target: Element, key: string) {
	let reachedWindow = false;
	const listener = () => (reachedWindow = true);
	window.addEventListener('keydown', listener);
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	window.removeEventListener('keydown', listener);
	return { prevented: event.defaultPrevented, stopped: !reachedWindow };
}

// Read synchronously: each cancel has to land before the handler module can have loaded.
async function pinFoldedGuards() {
	const list = element('[data-list]');
	expect(press(list, 'Tab').prevented).toBe(false);
	expect(press(list, 'a').prevented).toBe(false);
	expect(press(list, 'ArrowDown').prevented).toBe(true);
	await expect.poll(() => text('[data-active]')).toBe('1');
	expect(press(list, 'ArrowDown').prevented).toBe(true);
	await expect.poll(() => text('[data-active]')).toBe('2');
	expect(press(list, 'ArrowUp').prevented).toBe(true);
	await expect.poll(() => text('[data-active]')).toBe('1');
	expect(press(list, 'ArrowLeft').prevented).toBe(false);
	expect(press(list, 'Enter').prevented).toBe(false);
	expect(text('[data-active]')).toBe('1');

	const field = element('[data-dialog-field]');
	expect(press(field, 'Escape')).toEqual({ prevented: true, stopped: false });
	await expect.poll(() => text('[data-escapes]')).toBe('1');
	expect(press(field, 'x')).toEqual({ prevented: false, stopped: true });
	expect(text('[data-escapes]')).toBe('1');
}

test('CSR: two guarded cancel blocks cancel exactly their keys', async () => {
	await render(Page);
	await pinFoldedGuards();
});

test('SSR: two guarded cancel blocks cancel exactly their keys before the handler loads', async () => {
	await renderSSR(Page);
	await pinFoldedGuards();
});
