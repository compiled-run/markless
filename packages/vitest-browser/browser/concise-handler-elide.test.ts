import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ConciseHandlerElide from './fixtures/concise-handler-elide.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function submit(container: HTMLElement, selector: string): Event {
	const event = new Event('submit', { bubbles: true, cancelable: true });
	requireElement(container, selector).dispatchEvent(event);
	return event;
}

test('SSR: a concise-body preventDefault handler cancels the submit at capture', async () => {
	const screen = await renderSSR(ConciseHandlerElide);
	const container = screen.container;

	// Cancelled before any handler symbol could have loaded — and there is no
	// handler symbol left to load, because the policy subsumed the whole body.
	expect(submit(container, 'form[data-concise-form]').defaultPrevented).toBe(true);

	await new Promise((resolve) => setTimeout(resolve, 0));

	expect(submit(container, 'form[data-braced-form]').defaultPrevented).toBe(true);
});

test('CSR: a concise-body preventDefault handler cancels the submit', async () => {
	const screen = await render(ConciseHandlerElide);
	const container = screen.container as HTMLElement;

	// The client-mounted dispatch path runs the policy on its own task, so the
	// flag is read after it, not inline with dispatchEvent.
	const concise = submit(container, 'form[data-concise-form]');
	await expect.poll(() => concise.defaultPrevented).toBe(true);

	const braced = submit(container, 'form[data-braced-form]');
	await expect.poll(() => braced.defaultPrevented).toBe(true);
});
