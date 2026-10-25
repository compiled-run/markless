import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './av-page.tsrx';

afterEach(() => cleanup());

const out = (container: HTMLElement, name: string) =>
	container.querySelector<HTMLElement>(`[data-${name}]`)!.textContent;

const press = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLButtonElement>(selector)!.click();

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: an assignment used as a value answers the value it assigned`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(Page) : render(Page));
		const seen = () => out(container, 'seen');

		press(container, '[data-case="argument"]');
		await expect.poll(seen).toBe('argument:5');
		press(container, '[data-case="compound"]');
		await expect.poll(seen).toBe('compound:7');
		press(container, '[data-case="nullish"]');
		await expect.poll(seen).toBe('nullish:set');
		press(container, '[data-case="chained"]');
		await expect.poll(seen).toBe('chained:7');
		expect(out(container, 'other')).toBe('7');
		press(container, '[data-case="condition"]');
		await expect.poll(seen).toBe('condition:3');
		press(container, '[data-case="shadow"]');
		await expect.poll(seen).toBe('shadow:7');
		press(container, '[data-case="push"]');
		await expect.poll(() => out(container, 'list')).toBe('9');
		press(container, '[data-case="returned"]');
		await expect.poll(seen).toBe('returned:11');
		press(container, '[data-pick]');
		await expect.poll(() => out(container, 'got')).toBe('pick:12');
		expect(out(container, 'count')).toBe('12');
	});
}
