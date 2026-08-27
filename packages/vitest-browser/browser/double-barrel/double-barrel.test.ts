import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import FolderFirstPage from './alpha/scenarios/folder-first.tsrx';
import RootFirstPage from './beta/scenarios/root-first.tsrx';

// A module's identity is its resolved path, not the specifier that reached it. Both
// pages name one family through its folder barrel and another through a root barrel
// that re-exports that same folder barrel, so the barrel walk publishes one module
// under one specifier twice and the second write wins. Red until that write merges:
// folder-first loses the components and fails to compile, root-first loses the
// shared re-export and throws at render.
afterEach(() => cleanup());

function one(container: ParentNode, selector: string) {
	const found = container.querySelector(selector);
	if (!found) throw new Error(`Expected "${selector}" on the page.`);
	return found;
}

function text(container: ParentNode, selector: string) {
	return one(container, selector).textContent?.trim();
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the family named through its folder barrel renders beside one named through the root barrel`, async () => {
		const screen =
			mode === 'CSR' ? await render(FolderFirstPage) : await renderSSR(FolderFirstPage);
		const container = screen.container as ParentNode;

		expect(text(container, '[data-alpha-root] [data-alpha-label]')).toBe(
			'alpha via its folder barrel',
		);
		expect(text(container, '[data-beta-root] [data-beta-label]')).toBe(
			'beta via the root barrel',
		);
	});

	test(`${mode}: the same page with the barrels swapped renders both families`, async () => {
		const screen = mode === 'CSR' ? await render(RootFirstPage) : await renderSSR(RootFirstPage);
		const container = screen.container as ParentNode;

		expect(text(container, '[data-alpha-root] [data-alpha-label]')).toBe(
			'alpha via the root barrel',
		);
		expect(text(container, '[data-beta-root] [data-beta-label]')).toBe(
			'beta via its folder barrel',
		);
	});
}
