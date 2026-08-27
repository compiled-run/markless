import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import StepperPage from './stepper-page.tsrx';

// Two sibling parts in one module each declare `const isOff = computed(...)` over
// a DIFFERENT formula. Each part's cell must answer its own formula: one shared
// cell means the survivor's answer is written on both buttons, and the wrong
// button is silently left enabled.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

function gate(container: ParentNode, selector: string): boolean {
	return (one(container, selector) as HTMLButtonElement).hasAttribute('disabled');
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: same-named sibling gate cells answer their own formula`, async () => {
		const screen = mode === 'CSR' ? await render(StepperPage) : await renderSSR(StepperPage);
		const container = screen.container as ParentNode;

		expect(one(container, '[data-readout]').textContent?.trim()).toBe('1 of 3');
		expect(gate(container, '[data-back]')).toBe(true);
		expect(gate(container, '[data-forward]')).toBe(false);
	});

	test(`${mode}: the gates flip independently as the step walks`, async () => {
		const screen = mode === 'CSR' ? await render(StepperPage) : await renderSSR(StepperPage);
		const container = screen.container as ParentNode;

		one(container, '[data-forward]').click();
		await expect.poll(() => one(container, '[data-readout]').textContent?.trim()).toBe('2 of 3');
		expect(gate(container, '[data-back]')).toBe(false);
		expect(gate(container, '[data-forward]')).toBe(false);

		one(container, '[data-forward]').click();
		await expect.poll(() => one(container, '[data-readout]').textContent?.trim()).toBe('3 of 3');
		expect(gate(container, '[data-back]')).toBe(false);
		await expect.poll(() => gate(container, '[data-forward]')).toBe(true);

		one(container, '[data-back]').click();
		await expect.poll(() => one(container, '[data-readout]').textContent?.trim()).toBe('2 of 3');
		await expect.poll(() => gate(container, '[data-forward]')).toBe(false);
		expect(gate(container, '[data-back]')).toBe(false);
	});
}
