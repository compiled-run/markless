import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowHelperReads from './row-helper-reads/page.tsrx';

// A row value that calls a body helper reading state repaints when that state moves.
afterEach(() => cleanup());

const classes = (root: ParentNode, attribute: string) =>
	[...root.querySelectorAll(`[${attribute}]`)].map(
		(element) => `${element.getAttribute(attribute)}:${element.getAttribute('class')}`,
	);

const shown = (root: ParentNode) => ({
	row: classes(root, 'data-row'),
	only: classes(root, 'data-only'),
	chain: classes(root, 'data-chain'),
	factory: classes(root, 'data-factory'),
	miss: classes(root, 'data-miss'),
	outside: [
		root.querySelector('[data-outside]')!.getAttribute('data-outside'),
		root.querySelector('[data-outside]')!.textContent,
	],
});

async function helperReadsRepaint(root: ParentNode) {
	expect(shown(root)).toEqual({
		row: ['core:row', 'web:row', 'router:row'],
		only: ['core:ok', 'web:ok', 'router:ok'],
		chain: ['core:ok', 'web:ok', 'router:ok'],
		factory: ['core:ok', 'web:ok', 'router:ok'],
		miss: ['core0:off', 'router0:off', 'router1:off'],
		outside: ['-1', 'clear'],
	});
	root.querySelector<HTMLElement>('[data-delete]')!.click();
	await expect
		.poll(() => shown(root))
		.toEqual({
			row: ['core:row red', 'web:row del', 'router:row red'],
			only: ['core:red', 'web:ok', 'router:red'],
			chain: ['core:red', 'web:ok', 'router:red'],
			factory: ['core:red', 'web:ok', 'router:red'],
			miss: ['core0:on', 'router0:off', 'router1:on'],
			outside: ['1', 'hit'],
		});
}

test('CSR: a constant @for row value calling a body helper that reads state repaints', async () => {
	await helperReadsRepaint((await render(RowHelperReads)).container);
});

test('SSR: a constant @for row value calling a body helper that reads state repaints', async () => {
	await helperReadsRepaint((await renderSSR(RowHelperReads)).container);
});
