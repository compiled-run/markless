import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FixedPropPage from './k-fixed-prop-page.tsrx';

// A prop the parent works out with plain code from fixed values, read by a child's async value and arm, both run again in the browser.
afterEach(cleanup);

const shown = () =>
	[...document.querySelectorAll<HTMLElement>('[data-g]')].map(
		(line) => `${line.dataset.g}: ${line.textContent}`,
	);

async function theChildKeepsItsProp() {
	await expect.poll(shown).toEqual(['q: ada', 'found: ADA 0']);
	const again = document.querySelector<HTMLButtonElement>('main [data-again]')!;
	again.click();
	await expect.poll(shown).toEqual(['q: ada', 'found: ADA 1']);
	again.click();
	await expect.poll(shown).toEqual(['q: ada', 'found: ADA 2']);
	document.querySelector<HTMLButtonElement>('main [data-toggle]')!.click();
	await expect.poll(shown).toEqual(['q: ada', 'found: ADA 2', 'arm: ada!']);
}

test('CSR', async () => {
	await render(FixedPropPage);
	await theChildKeepsItsProp();
});

test('SSR', async () => {
	await renderSSR(FixedPropPage);
	await theChildKeepsItsProp();
});
