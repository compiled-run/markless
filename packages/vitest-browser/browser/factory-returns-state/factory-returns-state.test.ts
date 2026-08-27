import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import DirectPage from './scenarios/direct-page.tsrx';
import WrappedPage from './scenarios/wrapped-page.tsrx';

// A `shared()` factory's return IS its cell set. Returning `state({...})` directly
// and returning a wrapper object that spreads it must behave identically: the
// wrapper shape is the control, the direct shape is the measurement.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: a factory returning state() directly feeds an attribute and a text read`, async () => {
		const screen = mode === 'CSR' ? await render(DirectPage) : await renderSSR(DirectPage);
		const container = screen.container as ParentNode;

		expect(one(container, '[data-direct-root]').getAttribute('data-direct-tone')).toBe('plain');
		expect(one(container, '[data-direct-note]').textContent?.trim()).toBe('direct');
	});

	test(`${mode}: the wrapper-object control feeds the same two reads`, async () => {
		const screen = mode === 'CSR' ? await render(WrappedPage) : await renderSSR(WrappedPage);
		const container = screen.container as ParentNode;

		expect(one(container, '[data-wrapped-root]').getAttribute('data-wrapped-tone')).toBe(
			'plain',
		);
		expect(one(container, '[data-wrapped-note]').textContent?.trim()).toBe('wrapped');
	});
}
