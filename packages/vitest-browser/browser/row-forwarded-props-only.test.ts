import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowsPropsOnly from './row-forwarded-props/rows-props-only.tsrx';
import RowsPropsOnlyInPage from './row-forwarded-props/rows-props-only-in-page.tsrx';

afterEach(() => cleanup());

// The label reads props alone; the click only writes state a data attribute shows.
async function rowPropReachesPropsOnlyReaders(container: HTMLElement) {
	const button = (name: string, to: string) =>
		container.querySelector<HTMLButtonElement>(`[data-pick="${name}-${to}"]`)!;
	for (const name of ['one', 'two'])
		for (const to of ['dark', 'light']) {
			expect(button(name, to).textContent).toBe(`${name} ${to}`);
			button(name, to).click();
			await expect.poll(() => button(name, to).dataset.last).toBe(`${name}:${to}`);
			expect(button(name, to).textContent).toBe(`${name} ${to}`);
		}
}

test('CSR: a row item forwarded to a props-only expression renders and stays', async () => {
	await rowPropReachesPropsOnlyReaders((await render(RowsPropsOnly)).container as HTMLElement);
});
test('SSR resume: a row item forwarded to a props-only expression renders and stays', async () => {
	await rowPropReachesPropsOnlyReaders((await renderSSR(RowsPropsOnly)).container as HTMLElement);
});
test('CSR: a row item forwarded to a props-only expression inside the page file renders and stays', async () => {
	await rowPropReachesPropsOnlyReaders(
		(await render(RowsPropsOnlyInPage)).container as HTMLElement,
	);
});
test('SSR resume: a row item forwarded to a props-only expression inside the page file renders and stays', async () => {
	await rowPropReachesPropsOnlyReaders(
		(await renderSSR(RowsPropsOnlyInPage)).container as HTMLElement,
	);
});
