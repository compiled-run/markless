import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ShapesPage from './row-callback/shapes.tsrx';
import TreePage from './row-callback/page.tsrx';
import UnshadowedTreePage from './row-callback/page-unshadowed.tsrx';

// A component a constant @for renders gets its props from the row, so a callback it passes on runs with that row's values.
afterEach(() => cleanup());

function click(root: ParentNode, selector: string) {
	root.querySelector<HTMLElement>(selector)!.click();
}

async function treeCallbackReadsItsRow(root: ParentNode) {
	click(root, '[data-toggle="beta"]');
	await expect.poll(() => root.querySelector('[data-seen="beta"]')?.textContent).toBe('x:beta');
	click(root, '[data-toggle="alpha"]');
	await expect.poll(() => root.querySelector('[data-seen="alpha"]')?.textContent).toBe('x:alpha');
	expect(root.querySelector('[data-seen="beta"]')?.textContent).toBe('x:beta');
}

const shapes = {
	'an element handler': ['direct', '[data-direct="{}"]'],
	'a callback prop a child calls': ['press', '[data-press="{}"]'],
	'a callback prop a child spreads onto its element': ['spread', '[data-spread="{}"]'],
	'a part callback': ['toggle', '[data-toggle="{}"]'],
} as const;

async function shapeReadsItsRow(root: ParentNode, [label, trigger]: readonly [string, string]) {
	for (const name of ['two', 'one']) {
		click(root, trigger.replace('{}', name));
		await expect
			.poll(() => root.querySelector(`[data-seen="${name}"]`)?.textContent)
			.toBe(`${label}:${name}`);
	}
}

test('CSR: a tree item callback in a child a constant @for renders reads its row prop', async () => {
	await treeCallbackReadsItsRow((await render(TreePage)).container);
});

test('SSR: a tree item callback in a child a constant @for renders reads its row prop', async () => {
	await treeCallbackReadsItsRow((await renderSSR(TreePage)).container);
});

// The page's const and the child's prop no longer share a name, so nothing but the callback slot lifts the list.
test('CSR: the tree item callback reads its row when no page name matches a child prop', async () => {
	await treeCallbackReadsItsRow((await render(UnshadowedTreePage)).container);
});

test('SSR: the tree item callback reads its row when no page name matches a child prop', async () => {
	await treeCallbackReadsItsRow((await renderSSR(UnshadowedTreePage)).container);
});

for (const [shape, entry] of Object.entries(shapes)) {
	test(`CSR: ${shape} in a constant @for row reads its row`, async () => {
		await shapeReadsItsRow((await render(ShapesPage)).container, entry);
	});

	test(`SSR: ${shape} in a constant @for row reads its row`, async () => {
		await shapeReadsItsRow((await renderSSR(ShapesPage)).container, entry);
	});
}
