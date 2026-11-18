import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import FlatPage from './nested-row-components/flat.tsrx';
import ImportedPage from './nested-row-components/imported.tsrx';
import RowedChainPage from './nested-row-components/rowed-chain.tsrx';
import WrappedPage from './nested-row-components/wrapped.tsrx';

// A component placed inside nested keyed rows is one instance per row of every loop around it.
afterEach(() => cleanup());

async function eachInstanceKeepsItsRows(root: ParentNode, trigger: string, label: string) {
	for (const name of ['b-y', 'a-x', 'b-x', 'a-y']) {
		root.querySelector<HTMLElement>(`[${trigger}="${name}"]`)!.click();
		await expect
			.poll(() => root.querySelector(`[data-seen="${name}"]`)?.textContent)
			.toBe(`${label}:${name}`);
	}
}

test('CSR: a component two nested @for loops place handles its click', async () => {
	await eachInstanceKeepsItsRows((await render(FlatPage)).container, 'data-cell', 'cell');
});

test('SSR: a component two nested @for loops place handles its click', async () => {
	await eachInstanceKeepsItsRows((await renderSSR(FlatPage)).container, 'data-cell', 'cell');
});

test('CSR: a component in nested @for loops with an element between them', async () => {
	await eachInstanceKeepsItsRows((await render(WrappedPage)).container, 'data-cell', 'cell');
});

test('SSR: a component in nested @for loops with an element between them', async () => {
	await eachInstanceKeepsItsRows((await renderSSR(WrappedPage)).container, 'data-cell', 'cell');
});

test('CSR: an imported component two nested @for loops place', async () => {
	await eachInstanceKeepsItsRows((await render(ImportedPage)).container, 'data-cell', 'cell');
});

test('SSR: an imported component two nested @for loops place', async () => {
	await eachInstanceKeepsItsRows((await renderSSR(ImportedPage)).container, 'data-cell', 'cell');
});

test('CSR: a callback two components deep inside a constant @for row keeps its captures', async () => {
	await eachInstanceKeepsItsRows((await render(RowedChainPage)).container, 'data-press', 'leaf');
});

test('SSR: a callback two components deep inside a constant @for row keeps its captures', async () => {
	await eachInstanceKeepsItsRows((await renderSSR(RowedChainPage)).container, 'data-press', 'leaf');
});
