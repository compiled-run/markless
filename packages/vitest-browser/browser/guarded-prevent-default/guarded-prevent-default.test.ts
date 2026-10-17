import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './gpd-page.tsrx';

afterEach(cleanup);

const field = (name: string) => document.querySelector<HTMLInputElement>(`[data-${name}-field]`)!;
const text = (selector: string) => document.querySelector(selector)?.textContent;

function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event.defaultPrevented;
}

// Read synchronously: the cancel has to land before the handler module can have loaded.
async function pinGuardsHold() {
	expect(press(field('submit'), 'Tab')).toBe(false);
	expect(press(field('submit'), 'a')).toBe(false);
	expect(press(field('submit'), 'Enter')).toBe(true);
	await expect.poll(() => text('[data-submits]')).toBe('1');

	expect(press(field('save'), 's', { metaKey: true })).toBe(false);
	expect(press(field('save'), 's', { ctrlKey: true })).toBe(false);
	expect(press(field('save'), 's')).toBe(true);
	await expect.poll(() => text('[data-saves]')).toBe('1');
}

test('CSR: an early-return guard and a modifier guard decide the cancel', async () => {
	await render(Page);
	await pinGuardsHold();
});

test('SSR: an early-return guard and a modifier guard decide the cancel', async () => {
	await renderSSR(Page);
	await pinGuardsHold();
});
