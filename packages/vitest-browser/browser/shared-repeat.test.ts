import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/shared-repeat.tsrx';

/**
 * Defect 86. `@for (const item of box.items; key item.id)` where `box` is a
 * component's shared-instance local never resolved to a graph cell, so the SSR
 * module re-emitted the authored `box.items` into a scope that declares no
 * `box`: the first server render threw a ReferenceError, with nothing said at
 * build time. The same fixture's attribute read of `box.items.length` already
 * resolved, which is what made the gap a repeat-only one.
 *
 * What the dispatch rows assert is a drop and a restore, both within the keys
 * the server served. Growing a repeat PAST the served keys is defect 84, open
 * and pinned as `test.fails` in krg.test.ts for plain state and computed
 * collections alike; it is the same gap through a shared instance and not this
 * fix's to close.
 */
afterEach(() => cleanup());

const seeded = ['Alpha', 'Beta', 'Gamma'];

function rowLabels(container: ParentNode) {
	return [...container.querySelectorAll('[data-shared-repeat-row]')].map((row) => row.textContent);
}

function count(container: ParentNode) {
	return container.querySelector('[data-shared-repeat]')?.getAttribute('data-shared-repeat-count');
}

function drop(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-shared-repeat-drop]')?.click();
}

function restore(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-shared-repeat-restore]')?.click();
}

test('SSR resume: a keyed repeat over a shared instance renders its rows', async () => {
	const screen = await renderSSR(Page);

	// Before the fix the server threw before producing any of this markup.
	expect(rowLabels(screen.container)).toEqual(seeded);
	expect(count(screen.container)).toBe('3');
});

test('SSR resume: dropping and restoring an item on the shared instance refreshes the rows', async () => {
	const screen = await renderSSR(Page);

	drop(screen.container);
	await expect.poll(() => rowLabels(screen.container)).toEqual(['Beta', 'Gamma']);
	await expect.poll(() => count(screen.container)).toBe('2');

	restore(screen.container);
	await expect.poll(() => rowLabels(screen.container)).toEqual(seeded);
	await expect.poll(() => count(screen.container)).toBe('3');
});

test('CSR: a keyed repeat over a shared instance renders and refreshes its rows', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	await expect.poll(() => rowLabels(container)).toEqual(seeded);

	drop(container);
	await expect.poll(() => rowLabels(container)).toEqual(['Beta', 'Gamma']);
	await expect.poll(() => count(container)).toBe('2');

	restore(container);
	await expect.poll(() => rowLabels(container)).toEqual(seeded);
	await expect.poll(() => count(container)).toBe('3');
});
