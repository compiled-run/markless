import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './native-sheet-page.tsrx';

afterEach(cleanup);

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
const closes = () => document.querySelector('[data-closes]')?.textContent;

for (const mode of ['ssr', 'csr'] as const) {
	test(`${mode}: the page's state opens and closes <native.sheet>, a modal panel over the page`, async () => {
		if (mode === 'ssr') await renderSSR(Page);
		else await render(Page);
		expect(panel().checkVisibility()).toBe(false);
		expect(panel().getAttribute('aria-modal')).toBe('true');

		await press('[data-open]');
		await expect.poll(() => panel().checkVisibility()).toBe(true);

		await press('[data-pick]');
		await expect.poll(() => panel().checkVisibility()).toBe(false);
		expect(closes()).toBe('Closed by the platform: 0');
	});

	test(`${mode}: Escape closes it as the platform's dismissal and calls onChange(false)`, async () => {
		if (mode === 'ssr') await renderSSR(Page);
		else await render(Page);
		await press('[data-open]');
		await expect.poll(() => panel().checkVisibility()).toBe(true);

		await userEvent.keyboard('{Escape}');
		await expect.poll(() => panel().checkVisibility()).toBe(false);
		expect(closes()).toBe('Closed by the platform: 1');
	});
}
