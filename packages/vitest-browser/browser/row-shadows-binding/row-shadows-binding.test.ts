import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import AsyncPage from './rsb-async-page.tsrx';
import StatePage from './rsb-state-page.tsrx';

afterEach(() => cleanup());

const texts = (container: HTMLElement, selector: string) =>
	[...container.querySelectorAll<HTMLElement>(selector)].map((element) => element.textContent);

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: a @for row named like a component state reads the row, and the state outside it`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(StatePage) : render(StatePage));

		expect(texts(container, '[data-text]')).toEqual(['a', 'b']);
		expect(texts(container, '[data-joined]')).toEqual(['a!', 'b!']);
		expect(texts(container, '[data-label]')).toEqual(['a', 'b']);
		expect(texts(container, '[data-part]')).toEqual(['a1', 'b1']);
		expect(texts(container, '[data-done]')).toEqual(['done']);
		expect([...container.querySelectorAll('[data-entry]')].map((row) => row.className)).toEqual(
			['warm', 'cool'],
		);
		expect(container.querySelector('[data-outer]')!.textContent).toBe('outer');
		expect(container.querySelector('[data-outer]')!.className).toBe('outer-tone');

		container.querySelectorAll<HTMLButtonElement>('[data-pick]')[1]!.click();
		await expect.poll(() => container.querySelector('[data-picked]')!.textContent).toBe('b');

		container.querySelector<HTMLButtonElement>('[data-rename]')!.click();
		await expect
			.poll(() => container.querySelector('[data-outer]')!.textContent)
			.toBe('renamed');
		expect(texts(container, '[data-text]')).toEqual(['a', 'b']);
	});
}

test('CSR: a @for row named like an async computed renders both', async () => {
	const { container } = await render(AsyncPage);
	await expect.poll(() => texts(container, '[data-row]')).toEqual(['one', 'two']);
	await expect.poll(() => container.querySelector('[data-item]')?.textContent).toBe('the item');
});
