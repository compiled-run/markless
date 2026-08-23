import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/krs-page.tsrx';

/**
 * Defect 56. `radiogroup.field` writes the form `name` onto the group's shared
 * widget instance; options built by a keyed `@for` submitted under `name=""`
 * while options written flat took the name. The fixture is that shape with the
 * family removed: one part declares a field on the instance, and reading parts
 * sit both beside the loop and inside its rows.
 *
 * Re-measured 2026-08-23 on the pilot tip, and the defect is NARROWER than the
 * note reported. It is the seed transport alone:
 *
 * - Green, both modes: a part beside the loop, and the root itself, read the
 *   declared field.
 * - Green, both modes: a write landing AFTER the rows exist reaches every row.
 *   So widget-instance resolution already works for a keyed row, and the rows
 *   are not stuck on a stale instance.
 * - Pinned, both modes: the SEED a part wrote before the rows were built never
 *   reaches them, so a row's first render reads the family's own initial value.
 *
 * The cause is in one transport. `renderSsrData` carries `sharedSeeds` into a
 * projection chunk, and through a branch arm and an async arm (both spread the
 * whole read context), but `case 'repeat'` builds a fresh context of `item`,
 * `index` and `key` and drops the seeds, so a row chunk renders as if the widget
 * had just been created. The compiler half is fixed on this branch - the SSR
 * emitter now forwards `sharedSeeds` to a row-scoped child edge, pinned in
 * packages/compiler/test/keyed-row-shared-seeds.test.ts - and cannot show until
 * the row context carries a seed map for it to forward.
 *
 * The three seed rows were `test.fails` pins while seat B was open; the repeat
 * row context now carries sharedSeeds, so they assert directly.
 */
afterEach(() => cleanup());

const rows = ['monthly', 'annual', 'lifetime'];

function names(container: ParentNode, selector: string) {
	return [...container.querySelectorAll<HTMLInputElement>(selector)].map((input) =>
		input.getAttribute('name'),
	);
}

function flatName(container: ParentNode) {
	return names(container, '[data-krs-flat] [data-krs-item]')[0];
}

function rootName(container: ParentNode) {
	return container.querySelector('[data-krs-root]')?.getAttribute('data-krs-root-name');
}

function rowNames(container: ParentNode) {
	return names(container, '[data-krs-rows] [data-krs-item]');
}

// The same read taken through a graph cell rather than as a bare field read.
function computedRowNames(container: ParentNode) {
	return names(container, '[data-krs-computed-rows] [data-krs-computed-item]');
}

function rename(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-krs-rename]')?.click();
}

// The control: a part placed beside the loop, and the root itself, both read
// what the declaring part wrote. Whatever the rows are missing, it is not the
// seed and it is not the write.
async function expectFlatReadsTheDeclaredName(container: ParentNode) {
	expect(flatName(container)).toBe('plan');
	expect(rootName(container)).toBe('plan');
	rename(container);
	await expect.poll(() => flatName(container)).toBe('late');
}

test('CSR: a part beside the loop reads what the declaring part wrote', async () => {
	const screen = await render(Page);
	await expectFlatReadsTheDeclaredName(screen.container as HTMLElement);
});

test('SSR resume: a part beside the loop reads what the declaring part wrote', async () => {
	const screen = await renderSSR(Page);
	await expectFlatReadsTheDeclaredName(screen.container);
});

// Defect 56 itself. Three shapes, each measured on its own so the receipt says
// which of them a fix moved.
test('CSR: a keyed row reads the field a sibling part declared', async () => {
	const screen = await render(Page);
	await expect.poll(() => rowNames(screen.container as HTMLElement)).toEqual(rows.map(() => 'plan'));
});

test('CSR: a keyed row reads the field through a computed() cell', async () => {
	const screen = await render(Page);
	await expect
		.poll(() => computedRowNames(screen.container as HTMLElement))
		.toEqual(rows.map(() => 'plan'));
});

/**
 * A write landing AFTER the rows exist takes the runtime dispatch path rather
 * than the seed path, and these two rows are GREEN — which is what narrows the
 * defect. Widget-instance resolution already reaches a keyed row: a later write
 * to the same field lands on every one of them, in both modes. What the rows
 * never get is the SEED the declaring part wrote before they were built, so the
 * gap is the seed transport alone and not the instance the rows resolve.
 */
test('CSR: a write landing after the rows exist reaches every row', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	rename(container);
	await expect.poll(() => flatName(container)).toBe('late');
	await expect.poll(() => rowNames(container)).toEqual(rows.map(() => 'late'));
});

test('SSR resume: a keyed row reads the field a sibling part declared', async () => {
	const screen = await renderSSR(Page);
	await expect.poll(() => rowNames(screen.container)).toEqual(rows.map(() => 'plan'));
});

test('SSR resume: a write landing after the rows exist reaches every row', async () => {
	const screen = await renderSSR(Page);
	rename(screen.container);
	await expect.poll(() => flatName(screen.container)).toBe('late');
	await expect.poll(() => rowNames(screen.container)).toEqual(rows.map(() => 'late'));
});
