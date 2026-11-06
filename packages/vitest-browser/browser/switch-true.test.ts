import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Battery from './switch-true/battery.tsrx';

// `@switch (true)` with condition cases picks the first case whose test holds and re-decides on every write the tests read.
afterEach(() => cleanup());

const level = (root: ParentNode) =>
	[...root.querySelectorAll('[data-level]')].map((p) => p.textContent);

async function followsTheCharge(root: ParentNode) {
	expect(level(root)).toEqual(['Good for hours']);
	const use = root.querySelector<HTMLElement>('[data-use]')!;
	use.click();
	await expect.poll(() => level(root)).toEqual(['Good for hours']);
	use.click();
	await expect.poll(() => level(root)).toEqual(['Low battery']);
	use.click();
	await expect.poll(() => level(root)).toEqual(['Low battery']);
	use.click();
	await expect.poll(() => level(root)).toEqual(['Charge now']);
	root.querySelector<HTMLElement>('[data-charge]')!.click();
	await expect.poll(() => level(root)).toEqual(['Good for hours']);
}

test('CSR: @switch (true) with condition cases follows its tests', async () => {
	await followsTheCharge((await render(Battery)).container);
});

test('SSR: @switch (true) with condition cases follows its tests', async () => {
	await followsTheCharge((await renderSSR(Battery)).container);
});
