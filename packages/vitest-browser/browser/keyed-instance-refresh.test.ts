import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import FlatPage from './fixtures/kir-flat-page.tsrx';
import LoopPage from './fixtures/kir-loop-page.tsrx';
import TwoPage from './fixtures/kir-two-page.tsrx';

/**
 * Defects 75 and 78, reproduced without a family in sight.
 *
 * 75: an item rendered inside a keyed `@for` row roots its own widget instance
 * AND reads the outer instance the loop sits in. Its click handler runs, but the
 * write never refreshes the DOM: `aria-selected` stays `false` on every row.
 *
 * 78: two instances of the same widget on one page. A write inside the first
 * must not move a marker inside the second.
 */
afterEach(() => cleanup());

function items(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-kir-item]')];
}

function selection(container: ParentNode) {
	return items(container).map((item) => item.getAttribute('aria-selected'));
}

function sideSelection(container: ParentNode, side: string) {
	return [...container.querySelectorAll<HTMLElement>(`[${side}] [data-kir-item]`)].map((item) =>
		item.getAttribute('aria-selected'),
	);
}

// The control: the same three items written flat. It says whether the repeat row
// is what breaks the loop page.
test('CSR: a flat item refreshes the whole group when it is chosen', async () => {
	const screen = await render(FlatPage);
	const container = screen.container as HTMLElement;
	expect(selection(container)).toEqual(['false', 'false', 'false']);

	items(container)[1]!.click();
	await expect.poll(() => selection(container)).toEqual(['false', 'true', 'false']);
});

// Defect 75 itself.
test('CSR: a keyed-loop item refreshes the whole group when it is chosen', async () => {
	const screen = await render(LoopPage);
	const container = screen.container as HTMLElement;
	expect(items(container)).toHaveLength(3);
	expect(selection(container)).toEqual(['false', 'false', 'false']);

	items(container)[1]!.click();
	await expect.poll(() => selection(container)).toEqual(['false', 'true', 'false']);
});

// The same write seen from the OUTER instance, which is not row-scoped at all:
// it says whether the write reached the group or was lost on the way in.
test('CSR: a keyed-loop item write reaches the outer instance', async () => {
	const screen = await render(LoopPage);
	const container = screen.container as HTMLElement;

	items(container)[2]!.click();
	await expect
		.poll(() => container.querySelector('[data-kir-root]')?.getAttribute('data-kir-value'))
		.toBe('cherry');
});

// Each row's own instance keeps its own value: the rows are not sharing one.
test('CSR: each keyed-loop row roots its own item instance', async () => {
	const screen = await render(LoopPage);
	const container = screen.container as HTMLElement;
	expect(items(container).map((item) => item.getAttribute('data-kir-item-value'))).toEqual([
		'apple',
		'banana',
		'cherry',
	]);
});

test('SSR resume: a keyed-loop item refreshes the whole group when it is chosen', async () => {
	const screen = await renderSSR(LoopPage);
	expect(selection(screen.container)).toEqual(['false', 'false', 'false']);

	items(screen.container)[1]!.click();
	await expect.poll(() => selection(screen.container)).toEqual(['false', 'true', 'false']);
});

// Defect 78.
test('CSR: a write in one widget instance leaves the other alone', async () => {
	const screen = await render(TwoPage);
	const container = screen.container as HTMLElement;

	[...container.querySelectorAll<HTMLElement>('[data-kir-right] [data-kir-item]')][0]!.click();
	await expect.poll(() => sideSelection(container, 'data-kir-right')).toEqual(['true', 'false']);
	expect(sideSelection(container, 'data-kir-left')).toEqual(['false', 'false']);

	[...container.querySelectorAll<HTMLElement>('[data-kir-left] [data-kir-item]')][1]!.click();
	await expect.poll(() => sideSelection(container, 'data-kir-left')).toEqual(['false', 'true']);
	// The right-hand instance never moved.
	expect(sideSelection(container, 'data-kir-right')).toEqual(['true', 'false']);
});

test('SSR resume: a write in one widget instance leaves the other alone', async () => {
	const screen = await renderSSR(TwoPage);
	const container = screen.container;

	[...container.querySelectorAll<HTMLElement>('[data-kir-right] [data-kir-item]')][0]!.click();
	await expect.poll(() => sideSelection(container, 'data-kir-right')).toEqual(['true', 'false']);
	expect(sideSelection(container, 'data-kir-left')).toEqual(['false', 'false']);
});
