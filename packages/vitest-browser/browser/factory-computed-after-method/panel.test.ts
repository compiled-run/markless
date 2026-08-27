import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import PanelPage from './panel-page.tsrx';

afterEach(() => cleanup());

function one(container: ParentNode, selector: string): HTMLElement {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found as HTMLElement;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: panel`, async () => {
		const screen = mode === 'CSR' ? await render(PanelPage) : await renderSSR(PanelPage);
		const container = screen.container as ParentNode;
		expect(one(container, '[data-panel-selection]').getAttribute('ui-held')).toBe('0,0,40,40');

		one(container, '[data-panel-method]').click();
		await expect
			.poll(() => one(container, '[data-panel-selection]').getAttribute('ui-own-x'))
			.toBe('1');
		await expect
			.poll(() => one(container, '[data-panel-selection]').getAttribute('ui-held'))
			.toBe('1,0,40,40');
		await expect
			.poll(() => one(container, '[data-panel-readout]').textContent?.trim())
			.toBe('1,0,40,40');
	});

	test(`${mode}: the part that hosts the trigger also follows its own write`, async () => {
		const screen = mode === 'CSR' ? await render(PanelPage) : await renderSSR(PanelPage);
		const container = screen.container as ParentNode;
		expect(one(container, '[data-panel-combined]').getAttribute('ui-held')).toBe('0,0,40,40');

		one(container, '[data-panel-combined]').click();
		await expect
			.poll(() => one(container, '[data-panel-combined]').getAttribute('ui-held'))
			.toBe('1,0,40,40');
	});
}
