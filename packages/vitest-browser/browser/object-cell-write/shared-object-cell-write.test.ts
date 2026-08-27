import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ObjectCellWriteFamilyPage from './family-page.tsrx';

// The same whole-object write, one layer up: the cell's seed is a plain object
// spread onto a `shared()` instance. Readers keyed on its fields have to see the
// new value whether the write comes from a shared method or from a part handler,
// the same way they do when the seed is an array.
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
		mode === 'CSR'
			? await render(ObjectCellWriteFamilyPage)
			: await renderSSR(ObjectCellWriteFamilyPage);
	return screen.container as ParentNode;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the shared instance renders the seeded object's fields`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocwf-x]')).toBe('1');
		expect(text(container, '[data-ocwf-y]')).toBe('2');
		expect(text(container, '[data-ocwf-shifted]')).toBe('101');
	});

	test(`${mode}: a shared method writing the object whole reaches a binding on its field`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocwf-method]');
		await expect.poll(() => text(container, '[data-ocwf-x]')).toBe('5');
		expect(text(container, '[data-ocwf-y]')).toBe('7');
	});

	test(`${mode}: a shared method writing the object whole re-derives a computed on its field`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocwf-method]');
		await expect.poll(() => text(container, '[data-ocwf-shifted]')).toBe('105');
	});

	test(`${mode}: a whole-object write reaches attribute, style and form readers of its fields`, async () => {
		const container = await mount(mode);
		const readout = one(container, '[data-ocwf-readout]') as HTMLElement;
		expect(readout.getAttribute('ui-own-x')).toBe('1');
		expect(readout.getAttribute('aria-valuenow')).toBe('2');

		press(container, '[data-ocwf-method]');
		await expect.poll(() => readout.getAttribute('ui-own-x')).toBe('5');
		expect(readout.getAttribute('aria-valuenow')).toBe('7');
		expect(readout.style.insetInlineStart).toBe('5px');
		expect((one(container, '[data-ocwf-field-value]') as HTMLInputElement).value).toBe('105');
	});

	test(`${mode}: a part handler writing the object whole reaches the same readers`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocwf-handler]');
		await expect.poll(() => text(container, '[data-ocwf-x]')).toBe('8');
		expect(text(container, '[data-ocwf-y]')).toBe('9');
		expect(text(container, '[data-ocwf-shifted]')).toBe('108');
	});

	// Controls: the two shapes crop had to fall back on.
	test(`${mode}: writing one field of the shared object reaches the same readers`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocwf-field]');
		await expect.poll(() => text(container, '[data-ocwf-x]')).toBe('3');
		expect(text(container, '[data-ocwf-shifted]')).toBe('103');
		expect(text(container, '[data-ocwf-y]')).toBe('2');
	});

	test(`${mode}: a shared method writing an array whole reaches a computed on its length`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocwf-array]');
		await expect.poll(() => text(container, '[data-ocwf-rows]')).toBe('3');
	});
}
