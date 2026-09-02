import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/sync-policy-live-cell-page.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function prevented(target: Element, key: string): boolean {
	const keydown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(keydown);
	return keydown.defaultPrevented;
}

async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 100));
}

// The key policy runs before the handler loads and reads a shared widget cell
// bare. After a handler has written that cell, the policy must read the value
// the handler wrote, not the served one and not nothing; a cell no handler
// wrote keeps answering with its served value.
async function expectPolicyFollowsTheCell(container: HTMLElement) {
	const field = requireElement<HTMLInputElement>(container, 'input[data-picker-field]');
	const toggle = requireElement<HTMLButtonElement>(container, 'button[data-picker-toggle]');
	const closed = requireElement<HTMLElement>(container, 'output[data-picker-closed]');

	expect(prevented(field, 'Home')).toBe(false);
	expect(prevented(field, 'End')).toBe(true);

	toggle.click();
	await expect.poll(() => closed.textContent).toBe('false');
	await settle();
	expect(prevented(field, 'Home')).toBe(true);
	expect(prevented(field, 'End')).toBe(true);

	toggle.click();
	await expect.poll(() => closed.textContent).toBe('true');
	await settle();
	expect(prevented(field, 'Home')).toBe(false);
	expect(prevented(field, 'End')).toBe(true);
}

test('CSR: a key policy over a shared widget cell follows the handler that writes it', async () => {
	const screen = await render(App);
	await expectPolicyFollowsTheCell(screen.container as HTMLElement);
});

test('SSR: a key policy over a shared widget cell follows the handler that writes it after resume', async () => {
	const screen = await renderSSR(App);
	await expectPolicyFollowsTheCell(screen.container);
});
