import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Battery from './else-if-chain/battery.tsrx';

// An @if / @else if / @else chain shows exactly one arm and re-decides on every write its tests read.
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

test('CSR: an @else if chain follows its tests', async () => {
	await followsTheCharge((await render(Battery)).container);
});

test('SSR: an @else if chain follows its tests', async () => {
	await followsTheCharge((await renderSSR(Battery)).container);
});
