import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowsDirect from './row-forwarded-props/rows-direct.tsrx';
import RowsGrowing from './row-forwarded-props/rows-growing.tsrx';
import RowsRenamed from './row-forwarded-props/rows-renamed.tsrx';
import RowsThreeFiles from './row-forwarded-props/rows-three-files.tsrx';
import RowsThroughPair from './row-forwarded-props/rows-through-pair.tsrx';

afterEach(() => cleanup());

// Each row's innermost label mixes the row-derived prop with the instance's own state.
async function rowPropReachesMixedReaders(container: HTMLElement, names: ReadonlyArray<string>) {
	const button = (name: string, to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-pick="${name}-${to}"]`)!;
	for (const name of names)
		for (const to of ['dark', 'light'])
			expect(button(name, to).textContent).toBe(`${name} ${to} -> `);
	for (const name of names)
		for (const to of ['dark', 'light']) {
			button(name, to).click();
			await expect
				.poll(() => button(name, to).textContent)
				.toBe(`${name} ${to} -> ${name}:${to}`);
		}
}

test('CSR: a row item passed straight to an imported child reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsDirect)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('SSR resume: a row item passed straight to an imported child reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsDirect)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('CSR: a row item forwarded through an imported component reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsThroughPair)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('SSR resume: a row item forwarded through an imported component reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsThroughPair)).container as HTMLElement, [
		'one',
		'two',
	]);
});
test('CSR: a row item field forwarded through three files reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsThreeFiles)).container as HTMLElement, [
		'alpha',
		'beta',
	]);
});
test('SSR resume: a row item field forwarded through three files reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsThreeFiles)).container as HTMLElement, [
		'alpha',
		'beta',
	]);
});
async function rowAddedAfterLoadReadsItsProp(container: HTMLElement) {
	await rowPropReachesMixedReaders(container, ['one']);
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
	await expect
		.poll(() => container.querySelector('[data-pick="two-dark"]')?.textContent)
		.toBe('two dark -> ');
	await rowPropReachesMixedReaders(container, ['two']);
}

test('CSR: a row added after load forwards its item to a mixed expression', async () => {
	await rowAddedAfterLoadReadsItsProp((await render(RowsGrowing)).container as HTMLElement);
});
test('SSR resume: a row added after load forwards its item to a mixed expression', async () => {
	await rowAddedAfterLoadReadsItsProp((await renderSSR(RowsGrowing)).container as HTMLElement);
});

// A row item's field changes in place after load: the row keeps its instance and state, and the forwarded expression follows the field.
async function renamedRowItemReachesReaders(container: HTMLElement) {
	await rowPropReachesMixedReaders(container, ['alpha', 'beta']);
	container.querySelector<HTMLButtonElement>('[data-rename]')!.click();
	const button = (to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-pick="gamma-${to}"]`);
	await expect.poll(() => button('dark')?.textContent).toBe('gamma dark -> alpha:dark');
	expect(button('light')?.textContent).toBe('gamma light -> alpha:light');
	button('dark')!.click();
	await expect.poll(() => button('dark')?.textContent).toBe('gamma dark -> gamma:dark');
}

test('CSR: a renamed row item reaches an expression forwarded through three files', async () => {
	await renamedRowItemReachesReaders((await render(RowsRenamed)).container as HTMLElement);
});
test('SSR resume: a renamed row item reaches an expression forwarded through three files', async () => {
	await renamedRowItemReachesReaders((await renderSSR(RowsRenamed)).container as HTMLElement);
});
