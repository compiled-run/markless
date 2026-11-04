import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowsInImport from './row-forwarded-props/rows-in-import.tsrx';
import RowsInPage from './row-forwarded-props/rows-in-page.tsrx';
import RowsInPageDirect from './row-forwarded-props/rows-in-page-direct.tsrx';
import RowsGrowingInPage from './row-forwarded-props/rows-growing-in-page.tsrx';
import RowsMixedPlacement from './row-forwarded-props/rows-mixed-placement.tsrx';
import RowsRenamedInPage from './row-forwarded-props/rows-renamed-in-page.tsrx';

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

test('CSR: a row item forwarded inside one imported file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsInImport)).container as HTMLElement, [
		'north',
		'south',
	]);
});
test('SSR resume: a row item forwarded inside one imported file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsInImport)).container as HTMLElement, [
		'north',
		'south',
	]);
});
test('CSR: a row item forwarded inside the page file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsInPage)).container as HTMLElement, [
		'ann',
		'bo',
	]);
});
test('SSR resume: a row item forwarded inside the page file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsInPage)).container as HTMLElement, [
		'ann',
		'bo',
	]);
});
test('CSR: a row item passed straight to a child in the page file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await render(RowsInPageDirect)).container as HTMLElement, [
		'cy',
		'di',
	]);
});
test('SSR resume: a row item passed straight to a child in the page file reaches an expression mixing it with state', async () => {
	await rowPropReachesMixedReaders((await renderSSR(RowsInPageDirect)).container as HTMLElement, [
		'cy',
		'di',
	]);
});
test('CSR: one component placed in a row and outside it reads each placement', async () => {
	await rowPropReachesMixedReaders((await render(RowsMixedPlacement)).container as HTMLElement, [
		'solo',
		'ed',
		'flo',
	]);
});
test('SSR resume: one component placed in a row and outside it reads each placement', async () => {
	await rowPropReachesMixedReaders(
		(await renderSSR(RowsMixedPlacement)).container as HTMLElement,
		['solo', 'ed', 'flo'],
	);
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

test('CSR: a renamed row item reaches an expression forwarded inside the page file', async () => {
	await renamedRowItemReachesReaders((await render(RowsRenamedInPage)).container as HTMLElement);
});
test('SSR resume: a renamed row item reaches an expression forwarded inside the page file', async () => {
	await renamedRowItemReachesReaders(
		(await renderSSR(RowsRenamedInPage)).container as HTMLElement,
	);
});

async function rowAddedAfterLoadReadsItsProp(container: HTMLElement) {
	await rowPropReachesMixedReaders(container, ['one']);
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
	await expect
		.poll(() => container.querySelector('[data-pick="two-dark"]')?.textContent)
		.toBe('two dark -> ');
	await rowPropReachesMixedReaders(container, ['two']);
}

test('CSR: a row added after load forwards its item to a mixed expression inside the page file', async () => {
	await rowAddedAfterLoadReadsItsProp((await render(RowsGrowingInPage)).container as HTMLElement);
});
test('SSR resume: a row added after load forwards its item to a mixed expression inside the page file', async () => {
	await rowAddedAfterLoadReadsItsProp(
		(await renderSSR(RowsGrowingInPage)).container as HTMLElement,
	);
});
