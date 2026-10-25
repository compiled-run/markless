import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import PropText from './prop-text.tsrx';

afterEach(() => cleanup());

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: text mixing props with state keeps each instance's props after the state changes`, async () => {
		const { container } = await (mode === 'SSR' ? renderSSR(PropText) : render(PropText));
		const rows = () => [...container.querySelectorAll<HTMLElement>('.mixed')];
		const texts = () => rows().map((row) => row.textContent).join('|');
		expect(texts()).toBe('solo [-]|pair [-]');
		rows()[0]!.click();
		await expect.poll(texts).toBe('solo [+9]|pair [-]');
		rows()[1]!.click();
		await expect.poll(texts).toBe('solo [+9]|pair [+2]');
		rows()[0]!.click();
		await expect.poll(texts).toBe('solo [-]|pair [+2]');
	});
}
