import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import Page from './page.tsrx';

// A part that composes ANOTHER family's widget root and projects a child part
// through it. The gesture that opens the handler demand-load window is captured
// before the handler module exists and replayed once it lands, and the replayed
// handler has to write the composed panel of the item it landed in - not the
// first one the page rendered.
afterEach(() => cleanup());

function marks(container: ParentNode, mark: string, expected: number): HTMLElement[] {
	const found = [...container.querySelectorAll<HTMLElement>(`[data-${mark}]`)];
	if (found.length !== expected)
		throw new Error(`Expected ${expected} [data-${mark}], saw ${found.length}.`);
	return found;
}

// Dispatched synchronously rather than driven through `userEvent`: the trip out
// to the browser driver and back is long enough for the handler module to land,
// which closes the demand-load window this witness exists to hold open. A
// synchronous keydown one statement after `focus()` is what a real first press
// on a served page looks like, and what the menubar rows do.
function pressArrowDownOn(control: HTMLElement): void {
	control.focus();
	control.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
}

async function expectPressedItemsPanel(container: ParentNode, index: number, opens: string) {
	const roots = marks(container, 'panel-root', 2);
	const surfaces = marks(container, 'panel-surface', 2);
	const other = index === 0 ? 1 : 0;
	const name = index === 0 ? 'one' : 'two';

	await expect.poll(() => roots[index]!.getAttribute('data-opens')).toBe(opens);
	expect(roots[index]!.getAttribute('data-opened-by')).toBe(name);
	await expect.poll(() => surfaces[index]!.getAttribute('data-opens')).toBe(opens);
	expect(surfaces[index]!.getAttribute('data-opened-by')).toBe(name);
	expect(roots[other]!.getAttribute('data-opens')).toBe('0');
	expect(roots[other]!.getAttribute('data-opened-by')).toBe('');
}

async function expectColdGestureOpensItsOwnPanel(container: ParentNode) {
	const controls = marks(container, 'bar-control', 2);

	pressArrowDownOn(controls[1]!);

	await expect.poll(() => controls[1]!.getAttribute('data-presses')).toBe('1');
	expect(controls[0]!.getAttribute('data-presses')).toBe('0');
	await expectPressedItemsPanel(container, 1, '1');
}

test('CSR: a cold gesture on the second item opens the panel that item composed', async () => {
	const screen = await render(Page);
	await expectColdGestureOpensItsOwnPanel(screen.container as HTMLElement);
});

test('SSR resume: a cold gesture on the second item opens the panel that item composed', async () => {
	const screen = await renderSSR(Page);
	await expectColdGestureOpensItsOwnPanel(screen.container as HTMLElement);
});

// The same page once the handler module is warm: the first press spends the
// demand-load window, so the second one runs against a loaded handler.
async function expectWarmGestureOpensItsOwnPanel(container: ParentNode) {
	const controls = marks(container, 'bar-control', 2);

	pressArrowDownOn(controls[0]!);
	await expect.poll(() => controls[0]!.getAttribute('data-presses')).toBe('1');

	pressArrowDownOn(controls[1]!);
	await expect.poll(() => controls[1]!.getAttribute('data-presses')).toBe('1');

	const roots = marks(container, 'panel-root', 2);
	await expect.poll(() => roots[1]!.getAttribute('data-opens')).toBe('1');
	expect(roots[1]!.getAttribute('data-opened-by')).toBe('two');
	expect(roots[0]!.getAttribute('data-opens')).toBe('1');
	expect(roots[0]!.getAttribute('data-opened-by')).toBe('one');
}

test('CSR: a warm gesture on the second item opens the panel that item composed', async () => {
	const screen = await render(Page);
	await expectWarmGestureOpensItsOwnPanel(screen.container as HTMLElement);
});

test('SSR resume: a warm gesture on the second item opens the panel that item composed', async () => {
	const screen = await renderSSR(Page);
	await expectWarmGestureOpensItsOwnPanel(screen.container as HTMLElement);
});
