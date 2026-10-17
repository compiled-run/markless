import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/wake-without-input.tsrx';

// Nothing here clicks, types or moves the pointer: the page has to wake on its own.
afterEach(() => cleanup());

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

test('SSR: onVisible runs once the element is on screen, before any input', async () => {
	const screen = await renderSSR(App);
	await expect.poll(() => text(screen.container, '[data-seen]')).toBe('yes');
});

test('SSR: attach waits for its host to be used, unless the host also listens for onVisible', async () => {
	const screen = await renderSSR(App);
	const attached = (selector: string) =>
		screen.container.querySelector(selector)?.getAttribute('data-attached');
	await expect.poll(() => attached('[data-attach-on-sight]')).toBe('yes');
	await expect.poll(() => text(screen.container, '[data-seen]')).toBe('yes');
	expect(attached('[data-attach-host]')).toBeNull();
});
