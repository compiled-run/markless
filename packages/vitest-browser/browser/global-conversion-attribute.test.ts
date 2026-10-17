import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import GlobalConversionAttribute from './fixtures/global-conversion-attribute.tsrx';

// A standard global conversion over state (`String(open)`) is a read like a method call on it.
afterEach(() => cleanup());

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectConversionsTrackState(container: HTMLElement) {
	const trigger = () => container.querySelector('[data-trigger]');
	const level = () => container.querySelector('[data-level]');
	expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
	expect(level()?.getAttribute('data-next')).toBe('5');
	expect(level()?.textContent).toBe('%234');
	click(container, '[data-trigger]');
	await expect.poll(() => trigger()?.getAttribute('aria-expanded')).toBe('true');
	click(container, '[data-trigger]');
	await expect.poll(() => trigger()?.getAttribute('aria-expanded')).toBe('false');
	click(container, '[data-level]');
	await expect.poll(() => level()?.getAttribute('data-next')).toBe('9');
	expect(level()?.textContent).toBe('%238');
}

test('CSR: attributes and text computed by a global conversion on state update after first render', async () => {
	const screen = await render(GlobalConversionAttribute);
	await expectConversionsTrackState(screen.container as HTMLElement);
});

test('SSR: attributes and text computed by a global conversion on state update after first render', async () => {
	const screen = await renderSSR(GlobalConversionAttribute);
	await expectConversionsTrackState(screen.container as HTMLElement);
});
