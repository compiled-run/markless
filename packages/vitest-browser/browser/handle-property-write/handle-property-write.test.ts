import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ScrollPage from './scroll-page.tsrx';

afterEach(() => cleanup());

for (const mode of ['csr', 'ssr'] as const) {
	test(`${mode}: a handler sets writable DOM properties through an element() handle`, async () => {
		const container =
			mode === 'csr'
				? ((await render(ScrollPage)).container as unknown as HTMLElement)
				: (await renderSSR(ScrollPage)).container;
		const viewport = container.querySelector<HTMLDivElement>('[data-viewport]')!;
		const field = container.querySelector<HTMLInputElement>('[data-field]')!;
		const button = container.querySelector<HTMLButtonElement>('[data-scroll]')!;

		button.click();
		await expect.poll(() => viewport.scrollTop).toBe(120);
		expect(viewport.dataset.scrolled).toBe('yes');
		expect(field.value).toBe('typed');

		button.click();
		await expect.poll(() => viewport.scrollTop).toBe(160);
	});
}
