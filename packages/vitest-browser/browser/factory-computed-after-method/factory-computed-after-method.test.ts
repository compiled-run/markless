import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import GaugePage from './gauge-page.tsrx';

// A computed declared inside the shared() factory, over cells declared beside it,
// must re-derive after a factory method writes one of those cells. The raw cell on
// `ui-x` is the control: it follows the identical write, so a frozen `ui-right`
// beside a moving `ui-x` is the derived edge going missing, not the write.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

function right(container: ParentNode) {
	return one(container, '[data-gauge-area]').getAttribute('ui-right');
}

function rawX(container: ParentNode) {
	return one(container, '[data-gauge-area]').getAttribute('ui-x');
}

function readout(container: ParentNode) {
	return one(container, '[data-gauge-readout]').textContent?.trim();
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a factory computed is bound with its first value`, async () => {
		const screen = mode === 'CSR' ? await render(GaugePage) : await renderSSR(GaugePage);
		const container = screen.container as ParentNode;

		expect(right(container)).toBe('5');
		expect(rawX(container)).toBe('2');
		expect(readout(container)).toBe('5');
	});

	test(`${mode}: a factory method's write moves the factory computed on an attribute`, async () => {
		const screen = mode === 'CSR' ? await render(GaugePage) : await renderSSR(GaugePage);
		const container = screen.container as ParentNode;

		one(container, '[data-gauge-method]').click();
		await expect.poll(() => rawX(container)).toBe('3');
		await expect.poll(() => right(container)).toBe('6');

		one(container, '[data-gauge-method]').click();
		await expect.poll(() => rawX(container)).toBe('4');
		await expect.poll(() => right(container)).toBe('7');
	});

	test(`${mode}: a factory method's write moves the factory computed in text`, async () => {
		const screen = mode === 'CSR' ? await render(GaugePage) : await renderSSR(GaugePage);
		const container = screen.container as ParentNode;

		one(container, '[data-gauge-method]').click();
		await expect.poll(() => readout(container)).toBe('6');

		one(container, '[data-gauge-method]').click();
		await expect.poll(() => readout(container)).toBe('7');
	});

	test(`${mode}: the same write from a part handler moves it too`, async () => {
		const screen = mode === 'CSR' ? await render(GaugePage) : await renderSSR(GaugePage);
		const container = screen.container as ParentNode;

		one(container, '[data-gauge-handler]').click();
		await expect.poll(() => rawX(container)).toBe('3');
		await expect.poll(() => right(container)).toBe('6');
		await expect.poll(() => readout(container)).toBe('6');
	});
}
