import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import ObjectCellWriteWidePage from './wide-page.tsrx';

// The whole-object write inside the seed shape a real family has: a wide
// `state()` mixing literals, `undefined` and `as` casts, one field seeded a
// plain object, and methods that hoist every read into a local first.
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
			? await render(ObjectCellWriteWidePage)
			: await renderSSR(ObjectCellWriteWidePage);
	return screen.container as ParentNode;
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the wide seed renders its object field`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocww-x]')).toBe('1');
		expect(text(container, '[data-ocww-shifted]')).toBe('101');
		expect(one(container, '[data-ocww-readout]').getAttribute('ui-own-width')).toBe('10');
	});

	test(`${mode}: a method writing the object whole reaches every reader of its fields`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocww-place]');
		await expect.poll(() => text(container, '[data-ocww-x]')).toBe('5');
		expect(text(container, '[data-ocww-y]')).toBe('7');
		expect(text(container, '[data-ocww-shifted]')).toBe('105');
		expect(one(container, '[data-ocww-readout]').getAttribute('ui-own-x')).toBe('5');
	});

	test(`${mode}: a method writing an undefined-seeded object cell whole reaches its readers`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocww-handed]')).toBe('-1');

		press(container, '[data-ocww-hand]');
		await expect.poll(() => text(container, '[data-ocww-handed]')).toBe('6');
	});

	// The pair that separates the two candidate causes. If the whole-object write
	// were the thing that never lands, the factory computed on a scalar cell
	// would still follow its own write. Both are asserted from the same page.
	test(`${mode}: a factory-declared computed follows a whole-object write`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocww-factory-own-x]')).toBe('1');

		press(container, '[data-ocww-place]');
		await expect.poll(() => text(container, '[data-ocww-x]')).toBe('5');
		expect(text(container, '[data-ocww-factory-own-x]')).toBe('5');
	});

	test(`${mode}: a factory-declared computed follows a scalar write`, async () => {
		const container = await mount(mode);
		expect(text(container, '[data-ocww-factory-area]')).toBe('0');

		press(container, '[data-ocww-measure]');
		await expect.poll(() => text(container, '[data-ocww-factory-area]')).toBe('42');
	});

	test(`${mode}: the array control still reaches its computed`, async () => {
		const container = await mount(mode);
		press(container, '[data-ocww-grow]');
		await expect.poll(() => text(container, '[data-ocww-rows]')).toBe('3');
	});
}
