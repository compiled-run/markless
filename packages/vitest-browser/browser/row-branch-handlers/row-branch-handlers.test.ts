import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import BranchRootRowsPage from './branch-root-rows-page.tsrx';
import ComponentRowsPage from './component-rows-page.tsrx';
import EditRowsPage from './edit-rows-page.tsrx';

// An @if inside an @for row keeps its handlers on every row, through each flip, after resume as after a client render.
afterEach(() => cleanup());

function press(container: ParentNode, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} on the page.`);
	button.click();
}

async function editAndSaveEveryRow(container: ParentNode, ids: readonly string[] = ['b', 'a', 'b']) {
	for (const id of ids) {
		press(container, `[data-edit="${id}"]`);
		await expect.poll(() => container.querySelector(`[data-save="${id}"]`)).not.toBeNull();
		press(container, `[data-save="${id}"]`);
		await expect.poll(() => container.querySelector('[data-saved]')?.textContent).toBe(id);
		await expect.poll(() => container.querySelector(`[data-edit="${id}"]`)).not.toBeNull();
	}
}

test('SSR: an @if in each @for row flips and saves on every row', async () => {
	await editAndSaveEveryRow((await renderSSR(EditRowsPage)).container);
});

test('CSR: an @if in each @for row flips and saves on every row', async () => {
	await editAndSaveEveryRow((await render(EditRowsPage)).container);
});

test('SSR: rows whose root is an @if flip and save on every row', async () => {
	await editAndSaveEveryRow((await renderSSR(BranchRootRowsPage)).container, ['1', '0', '1']);
});

test('CSR: rows whose root is an @if flip and save on every row', async () => {
	await editAndSaveEveryRow((await render(BranchRootRowsPage)).container, ['1', '0', '1']);
});

test('SSR: rows rendered by a component flip and save on every row', async () => {
	await editAndSaveEveryRow((await renderSSR(ComponentRowsPage)).container);
});

test('CSR: rows rendered by a component flip and save on every row', async () => {
	await editAndSaveEveryRow((await render(ComponentRowsPage)).container);
});
