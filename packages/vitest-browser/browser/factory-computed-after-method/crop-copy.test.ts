import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import Basic from './crop-copy/basic.tsrx';

// The crop family's own source, with the two rectangle derivations moved back
// into the shared() factory: `held` as an object and `readoutText` as its label.
// A `computed()` declared beside the cells in a factory has to re-derive after a
// factory method writes one of them; a frozen readout here is that edge missing.

afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the arrowed rectangle moves the factory-declared readout`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const container = screen.container as ParentNode;
		const readout = () => one(container, 'output').textContent?.trim();
		expect(readout()).toBe('40, 30, 200×150');

		const selection = one(container, '[data-testid="selection"]');
		selection.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(readout).toBe('41, 30, 200×150');

		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(readout).toBe('42, 30, 200×150');
	});

	test(`${mode}: a part computed over the factory computed follows the same write`, async () => {
		const screen = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const container = screen.container as ParentNode;
		const selection = one(container, '[data-testid="selection"]');
		const box = () => selection.getAttribute('style');
		expect(box()).toContain('--x: 40px');

		selection.focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(box).toContain('--x: 41px');
	});
}
