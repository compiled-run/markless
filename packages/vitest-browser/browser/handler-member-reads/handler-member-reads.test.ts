import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './hmr-page.tsrx';

// A handle read through `?.at(-1)` or `[0]`, and a state read used as an index,
// run as the authored expressions do.
afterEach(() => cleanup());

const press = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLButtonElement>(selector)!.click();

const marked = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLElement>(selector)?.getAttribute('data-marked') ?? null;

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: a handle read after the write that adds its element answers that element`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Page) : render(Page));

		press(container, '[data-add]');
		await expect.poll(() => marked(container, '[data-gem="blue"]')).toBe('blue');
		expect(marked(container, '[data-gem="red"]')).toBeNull();

		press(container, '[data-first]');
		await expect.poll(() => marked(container, '[data-gem="red"]')).toBe('first');

		press(container, '[data-lead]');
		await expect.poll(() => marked(container, 'b')).toBe('lead');
	});

	test(`${mode}: a state read used as an index reads the current value`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Page) : render(Page));
		const from = () => container.querySelector('[data-from]')!.textContent;
		const measure = () =>
			container
				.querySelector('[data-measure]')!
				.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		measure();
		await expect.poll(from).toBe('10');
		press(container, '[data-next]');
		press(container, '[data-next]');
		measure();
		await expect.poll(from).toBe('30');
	});
}
