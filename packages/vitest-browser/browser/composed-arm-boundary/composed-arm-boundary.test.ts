import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BoundaryPage from './boundary-page.tsrx';
import ControlPage from './control-page.tsrx';

// A composed part projects its own `children` from inside an `@if` arm. Outside an
// async boundary that arm follows the caller's write, because the served branch
// record carries the child's prop route table. Inside a boundary the same branch
// registers as an arm-branch record of that boundary, which takes a different road.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

function text(container: ParentNode, selector: string) {
	return one(container, selector).textContent?.trim();
}

function advance(container: ParentNode) {
	(one(container, '[data-advance]') as HTMLButtonElement).click();
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode} control: an arm projection outside a boundary follows the write`, async () => {
		const screen = mode === 'CSR' ? await render(ControlPage) : await renderSSR(ControlPage);
		const container = screen.container as ParentNode;
		expect(text(container, '[data-caption]')).toBe('30 of 100 rows');

		advance(container);
		await expect.poll(() => text(container, '[data-note]')).toBe('60 of 100 rows');
		expect(text(container, '[data-caption]')).toBe('60 of 100 rows');
	});

	test(`${mode}: a bare projection inside a resolved boundary arm follows the write`, async () => {
		const screen = mode === 'CSR' ? await render(BoundaryPage) : await renderSSR(BoundaryPage);
		const container = screen.container as ParentNode;
		await expect.poll(() => text(container, '[data-ready]')).toBe('ready');
		expect(text(container, '[data-note]')).toBe('30 of 100 rows');

		advance(container);
		await expect.poll(() => text(container, '[data-note]')).toBe('60 of 100 rows');
	});

	test(`${mode}: an arm projection inside a resolved boundary arm follows the write`, async () => {
		const screen = mode === 'CSR' ? await render(BoundaryPage) : await renderSSR(BoundaryPage);
		const container = screen.container as ParentNode;
		await expect.poll(() => text(container, '[data-ready]')).toBe('ready');
		expect(text(container, '[data-caption]')).toBe('30 of 100 rows');

		advance(container);
		await expect.poll(() => text(container, '[data-note]')).toBe('60 of 100 rows');
		expect(text(container, '[data-caption]')).toBe('60 of 100 rows');
	});
}
