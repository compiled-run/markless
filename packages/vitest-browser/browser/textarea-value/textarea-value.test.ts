import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './tv-page.tsrx';

afterEach(() => cleanup());

const field = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector)!;

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: a textarea shows its value and follows it`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Page) : render(Page));
		const initial = 'Hello <b> & </textarea>';

		expect(field(container, '[data-body]').value).toBe(initial);
		expect(field(container, '[data-static]').value).toBe('fixed text');
		expect(field(container, '[data-mirror]').value).toBe(initial);
		expect(field(container, '[data-arm]').value).toBe(initial);
		expect(
			[...container.querySelectorAll<HTMLTextAreaElement>('[data-note]')].map(
				(note) => note.value,
			),
		).toEqual(['first note', 'second note']);
		expect(container.querySelector('[data-body]')!.hasAttribute('value')).toBe(false);

		const body = field(container, '[data-body]');
		body.value = 'typed';
		body.dispatchEvent(new Event('input', { bubbles: true }));
		await expect.poll(() => container.querySelector('[data-echo]')!.textContent).toBe('typed');
		expect(field(container, '[data-mirror]').value).toBe('typed');

		container.querySelector<HTMLButtonElement>('[data-reset]')!.click();
		await expect.poll(() => field(container, '[data-body]').value).toBe('reset');
		expect(field(container, '[data-arm]').value).toBe('reset');

		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('[data-arm]')).toBeNull();
		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('[data-arm]') !== null).toBe(true);
		expect(field(container, '[data-arm]').value).toBe('reset');
	});
}
