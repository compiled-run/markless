import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/attribute-presence.tsrx';

// An attribute whose value is undefined or false is absent, not empty: the
// name only reaches the DOM when the value says the attribute is present.
afterEach(() => cleanup());

function part(container: ParentNode, label: string) {
	return container.querySelector<HTMLButtonElement>(`[data-presence="${label}"]`);
}

function expectPresence(container: ParentNode) {
	expect(part(container, 'omitted')?.hasAttribute('disabled')).toBe(false);
	expect(part(container, 'omitted')?.hasAttribute('ui-disabled')).toBe(false);
	expect(part(container, 'false')?.hasAttribute('disabled')).toBe(false);
	expect(part(container, 'false')?.hasAttribute('ui-disabled')).toBe(false);
	expect(part(container, 'true')?.getAttribute('disabled')).toBe('');
	expect(part(container, 'true')?.getAttribute('ui-disabled')).toBe('');
	expect(part(container, 'flip')?.hasAttribute('disabled')).toBe(false);

	const branch = container.querySelector('[data-presence-branch]');
	expect(branch?.textContent).toBe('open');
}

async function expectFlip(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-flip]')?.click();
	await expect.poll(() => part(container, 'flip')?.hasAttribute('disabled')).toBe(true);
	expect(part(container, 'flip')?.getAttribute('disabled')).toBe('');
	expect(part(container, 'flip')?.getAttribute('ui-disabled')).toBe('');

	container.querySelector<HTMLButtonElement>('[data-flip]')?.click();
	await expect.poll(() => part(container, 'flip')?.hasAttribute('disabled')).toBe(false);
	expect(part(container, 'flip')?.hasAttribute('ui-disabled')).toBe(false);
}

test('CSR: falsy attribute values render no attribute at all', async () => {
	const screen = await render(App);
	expectPresence(screen.container as HTMLElement);
});

test('SSR: falsy attribute values render no attribute at all', async () => {
	const screen = await renderSSR(App);
	expectPresence(screen.container);
});

test('CSR: a reactive value adds and removes the attribute as it flips', async () => {
	const screen = await render(App);
	await expectFlip(screen.container as HTMLElement);
});

test('SSR: a reactive value adds and removes the attribute as it flips', async () => {
	const screen = await renderSSR(App);
	await expectFlip(screen.container);
});
