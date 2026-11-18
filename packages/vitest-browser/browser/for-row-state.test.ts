import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ForRowState from './for-row-state/page.tsrx';

// The fix the @for-row state() build error names: a row component gives each row its own state, kept with its key.
afterEach(() => cleanup());

const shown = (root: ParentNode) =>
	[...root.querySelectorAll('[data-like]')].map(
		(b) => `${b.getAttribute('data-like')}:${b.textContent}`,
	);

async function eachRowOwnsItsState(root: ParentNode) {
	expect(shown(root)).toEqual(['dune:like', 'emma:like']);
	root.querySelector<HTMLElement>('[data-like="emma"]')!.click();
	await expect.poll(() => shown(root)).toEqual(['dune:like', 'emma:liked']);
	root.querySelector<HTMLElement>('[data-reverse]')!.click();
	await expect.poll(() => shown(root)).toEqual(['emma:liked', 'dune:like']);
	root.querySelector<HTMLElement>('[data-add]')!.click();
	await expect.poll(() => shown(root)).toEqual(['emma:liked', 'dune:like', 'ulysses:like']);
	root.querySelector<HTMLElement>('[data-like="ulysses"]')!.click();
	await expect.poll(() => shown(root)).toEqual(['emma:liked', 'dune:like', 'ulysses:liked']);
	root.querySelector<HTMLElement>('[data-like="emma"]')!.click();
	await expect.poll(() => shown(root)).toEqual(['emma:like', 'dune:like', 'ulysses:liked']);
}

test('CSR: a row component state() is per row', async () => {
	await eachRowOwnsItsState((await render(ForRowState)).container);
});

test('SSR: a row component state() is per row', async () => {
	await eachRowOwnsItsState((await renderSSR(ForRowState)).container);
});
