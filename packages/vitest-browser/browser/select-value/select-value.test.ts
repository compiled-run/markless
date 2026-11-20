import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './sv-page.tsrx';

afterEach(() => cleanup());

const select = (container: HTMLElement, name: string) =>
	container.querySelector<HTMLSelectElement>(`[data-${name}]`)!;

test('the server marks the option a select value names', async () => {
	const { container } = await renderSSR(Page);
	const html = (name: string) => select(container, name).outerHTML;
	expect(html('size')).toContain('<option value="m" selected="">');
	expect(html('size')).not.toContain('<option value="s" selected');
	expect(html('crust')).toContain('<option value="thin" selected="">');
	expect(html('color')).toContain('<option selected="">Blue</option>');
	expect(html('plain')).toContain('<option selected="">m</option>');
	expect(html('fixed')).toContain('<option value="two" selected="">');
});

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: a select shows its value and follows it`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Page) : render(Page));

		expect(select(container, 'size').value).toBe('m');
		expect(select(container, 'crust').value).toBe('thin');
		expect(select(container, 'color').value).toBe('Blue');
		expect(select(container, 'plain').value).toBe('m');
		expect(select(container, 'fixed').value).toBe('two');
		expect(select(container, 'arm').value).toBe('m');

		container.querySelector<HTMLButtonElement>('[data-large]')!.click();
		await expect.poll(() => select(container, 'size').value).toBe('l');
		container.querySelector<HTMLButtonElement>('[data-stuffed]')!.click();
		await expect.poll(() => select(container, 'crust').value).toBe('stuffed');

		const size = select(container, 'size');
		size.value = 's';
		size.dispatchEvent(new Event('change', { bubbles: true }));
		await expect.poll(() => container.querySelector('[data-echo]')!.textContent).toBe('s');
		expect(select(container, 'size').value).toBe('s');
		expect(select(container, 'plain').value).toBe('s');
		expect(select(container, 'arm').value).toBe('s');

		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('[data-arm]')).toBeNull();
		container.querySelector<HTMLButtonElement>('[data-toggle]')!.click();
		await expect.poll(() => container.querySelector('[data-arm]') !== null).toBe(true);
		expect(select(container, 'arm').value).toBe('s');
	});
}
