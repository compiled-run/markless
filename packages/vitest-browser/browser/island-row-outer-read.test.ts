import { afterEach, expect, test } from 'vitest';
import { cleanup, renderCsrIslands, renderSSRIslands } from '../src/index.ts';
import StrokeFigure from './constant-row-outer-read/crr-island.tsrx';
import Rows from './row-outer-read/ror-page.tsrx';

afterEach(() => cleanup());

// An island's state lives under its own segment, so its rows must read and subscribe there too.
const islandStrokes = (island: Element) =>
	[...island.querySelectorAll('[data-stroke]')].map((node) => node.getAttribute('class'));

for (const [mode, mount] of [
	['SSR', () => renderSSRIslands([StrokeFigure, StrokeFigure])],
	['CSR', () => renderCsrIslands([StrokeFigure, StrokeFigure])],
] as const)
	test(`${mode}: in a page island, rows over a constant array follow state read from outside the @for`, async () => {
		const { container } = await mount();
		const [first, second] = [...container.querySelectorAll('figure')];
		expect(islandStrokes(first!)).toEqual(['swipe', 'swipe']);
		first!.querySelector<HTMLElement>('[data-hit="1"]')!.click();
		await expect.poll(() => islandStrokes(first!)).toEqual(['swipe', 'swipe pressed']);
		second!.querySelector<HTMLElement>('[data-hit="0"]')!.click();
		await expect.poll(() => islandStrokes(second!)).toEqual(['swipe pressed', 'swipe']);
		expect(islandStrokes(first!)).toEqual(['swipe', 'swipe pressed']);
	});

const marks = (island: Element) =>
	[...island.querySelectorAll('[data-mark]')].map((node) => node.textContent);

for (const [mode, mount] of [
	['SSR', () => renderSSRIslands([Rows, Rows])],
	['CSR', () => renderCsrIslands([Rows, Rows])],
] as const)
	test(`${mode}: in a page island, rows over state follow other state read from outside the @for`, async () => {
		const { container } = await mount();
		const [first, second] = [...container.querySelectorAll('main:has(> [data-add])')];
		first!.querySelector<HTMLElement>('[data-pick="2"]')!.click();
		await expect.poll(() => marks(first!)).toEqual(['no', 'yes', 'no']);
		second!.querySelector<HTMLElement>('[data-pick="3"]')!.click();
		await expect.poll(() => marks(second!)).toEqual(['no', 'no', 'yes']);
		expect(marks(first!)).toEqual(['no', 'yes', 'no']);
	});

for (const [mode, mount] of [
	['SSR', () => renderSSRIslands([Rows])],
	['CSR', () => renderCsrIslands([Rows])],
] as const)
	test(`${mode}: in a page island, a row added after resume follows state read from outside the @for`, async () => {
		const { container } = await mount();
		const island = container.querySelector('main:has(> [data-add])')!;
		island.querySelector<HTMLElement>('[data-add]')!.click();
		await expect.poll(() => marks(island)).toEqual(['no', 'no', 'no', 'no']);
		island.querySelector<HTMLElement>('[data-pick="4"]')!.click();
		await expect.poll(() => marks(island)).toEqual(['no', 'no', 'no', 'yes']);
	});
