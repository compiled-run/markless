import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import TogglePage from './conditionals-composed/toggle-page.tsrx';

// A handler that reassigns a local `let` before writing it into state still writes the state.
afterEach(() => cleanup());

const status = (root: ParentNode) => root.querySelector('[data-status]')?.textContent ?? null;

async function reassignedLetWritesState(root: ParentNode) {
	expect(status(root)).toBe('Paused');
	root.querySelector<HTMLElement>('[data-toggle]')!.click();
	await expect.poll(() => status(root)).toBe('Playing');
	root.querySelector<HTMLElement>('[data-toggle]')!.click();
	await expect.poll(() => status(root)).toBe('Paused');
}

test('CSR: a handler writing state from a reassigned local let updates the page', async () => {
	await reassignedLetWritesState((await render(TogglePage)).container);
});

test('SSR: a handler writing state from a reassigned local let updates the page', async () => {
	await reassignedLetWritesState((await renderSSR(TogglePage)).container);
});
