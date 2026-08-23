import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import KeydownPreventDefault from './fixtures/keydown-prevent-default.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the server-rendered DOM.`);
	return element;
}

function pressKey(target: Element, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

test('SSR: an event-field-guarded preventDefault cancels the default action at capture', async () => {
	const screen = await renderSSR(KeydownPreventDefault);
	const container = screen.container;
	const field = requireElement<HTMLInputElement>(container, 'input[data-field]');

	// The guard matches, so the default action is cancelled before the lazy
	// handler symbol can have loaded.
	const guarded = pressKey(field, 'ArrowDown');
	expect(guarded.defaultPrevented).toBe(true);

	await expect
		.poll(() => requireElement(container, 'output[data-field-moves]').textContent)
		.toBe('1');

	// A key outside the guard is left alone.
	const unguarded = pressKey(field, 'a');
	expect(unguarded.defaultPrevented).toBe(false);

	await expect
		.poll(() => requireElement(container, 'output[data-field-moves]').textContent)
		.toBe('2');
});
