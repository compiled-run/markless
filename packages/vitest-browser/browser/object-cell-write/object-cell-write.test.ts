import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ObjectCellWritePage from './page.tsrx';

// A state cell seeded with a plain object, written whole from a handler
// (`s.own = { x, y }`). Readers keyed on its fields — a text binding on
// `s.own.x` and a `computed()` deriving from it — have to see the new value,
// the same way they do when the seed is an array and the write replaces it.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

function text(container: ParentNode, selector: string) {
	return one(container, selector).textContent?.trim();
}

function press(container: ParentNode, selector: string) {
	(one(container, selector) as HTMLButtonElement).click();
}

async function mount(mode: 'CSR' | 'SSR') {
	const screen =
		mode === 'CSR' ? await render(ObjectCellWritePage) : await renderSSR(ObjectCellWritePage);
	return screen.container as ParentNode;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the seeded object's fields render`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocw-x]')).toBe('1');
		expect(text(container, '[data-ocw-y]')).toBe('2');
		expect(text(container, '[data-ocw-shifted]')).toBe('101');
	});

	test(`${mode}: a whole-object write reaches a binding on one of its fields`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocw-write-object]');
		await expect.poll(() => text(container, '[data-ocw-x]')).toBe('5');
		expect(text(container, '[data-ocw-y]')).toBe('7');
	});

	test(`${mode}: a whole-object write re-derives a computed reading one of its fields`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocw-write-object]');
		await expect.poll(() => text(container, '[data-ocw-shifted]')).toBe('105');
	});

	test(`${mode}: a whole-object write whose right side is a handler local reaches the same readers`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocw-write-object-local]');
		await expect.poll(() => text(container, '[data-ocw-x]')).toBe('8');
		expect(text(container, '[data-ocw-y]')).toBe('9');
		expect(text(container, '[data-ocw-shifted]')).toBe('108');
	});

	// Controls: the two shapes that were already known to work. They pin that a
	// regression in the whole-object path is not paid for by either of them.
	test(`${mode}: writing one field of the object reaches the same readers`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocw-write-field]');
		await expect.poll(() => text(container, '[data-ocw-x]')).toBe('3');
		expect(text(container, '[data-ocw-shifted]')).toBe('103');
		expect(text(container, '[data-ocw-y]')).toBe('2');
	});

	test(`${mode}: a whole-array write reaches a computed reading its length`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocw-write-array]');
		await expect.poll(() => text(container, '[data-ocw-rows]')).toBe('3');
	});
}
