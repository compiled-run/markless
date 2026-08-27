import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NestedPage from './nested-page.tsrx';
import OutsidePage from './outside-page.tsrx';
import RowsPage from './rows-page.tsrx';
import SiblingsPage from './siblings-page.tsrx';

// A handler that reads a SINGULAR element() handle of a widget-scoped family
// must reach the element of the instance the handler is running in, however many
// other instances of that family the page carries.
afterEach(() => cleanup());

function contents(container: ParentNode, expected: number) {
	const found = [...container.querySelectorAll<HTMLElement>('[data-level-content]')];
	if (found.length !== expected)
		throw new Error(`Expected ${expected} level contents, saw ${found.length}.`);
	return found;
}

async function expectOwnElementAtEveryDepth(container: ParentNode) {
	const levels = contents(container, 3);

	levels[2]!.click();
	await expect.poll(() => levels[2]!.getAttribute('data-clicked')).toBe('1');
	expect(levels[0]!.getAttribute('data-clicked')).toBeNull();
	expect(levels[1]!.getAttribute('data-clicked')).toBeNull();

	levels[1]!.click();
	await expect.poll(() => levels[1]!.getAttribute('data-clicked')).toBe('1');
	expect(levels[0]!.getAttribute('data-clicked')).toBeNull();

	levels[0]!.click();
	await expect.poll(() => levels[0]!.getAttribute('data-clicked')).toBe('1');
}

test('CSR: a handler at every depth reads its own level element', async () => {
	const screen = await render(NestedPage);
	await expectOwnElementAtEveryDepth(screen.container as HTMLElement);
});

test('SSR resume: a handler at every depth reads its own level element', async () => {
	const screen = await renderSSR(NestedPage);
	await expectOwnElementAtEveryDepth(screen.container);
});

async function expectKeydownOwnElement(container: ParentNode) {
	const levels = contents(container, 3);

	levels[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
	await expect.poll(() => levels[2]!.getAttribute('data-keyed')).toBe('ArrowDown');
	expect(levels[0]!.getAttribute('data-keyed')).toBeNull();
	expect(levels[1]!.getAttribute('data-keyed')).toBeNull();
}

test('CSR: a keydown handler reads its own level element', async () => {
	const screen = await render(NestedPage);
	await expectKeydownOwnElement(screen.container as HTMLElement);
});

test('SSR resume: a keydown handler reads its own level element', async () => {
	const screen = await renderSSR(NestedPage);
	await expectKeydownOwnElement(screen.container);
});

// Nesting is not the only way to put two instances on a page.
async function expectSiblingsDoNotCross(container: ParentNode) {
	const levels = contents(container, 2);

	levels[0]!.click();
	await expect.poll(() => levels[0]!.getAttribute('data-clicked')).toBe('1');
	expect(levels[1]!.getAttribute('data-clicked')).toBeNull();

	levels[1]!.click();
	await expect.poll(() => levels[1]!.getAttribute('data-clicked')).toBe('1');
	expect(levels[0]!.getAttribute('data-clicked')).toBe('1');
}

test('CSR: two sibling top-level instances do not cross', async () => {
	const screen = await render(SiblingsPage);
	await expectSiblingsDoNotCross(screen.container as HTMLElement);
});

test('SSR resume: two sibling top-level instances do not cross', async () => {
	const screen = await renderSSR(SiblingsPage);
	await expectSiblingsDoNotCross(screen.container);
});

// A row handler is minted per component edge, so the widget it marks can only
// come from the instance the dispatching row stands in.
async function expectRowReadsItsWidget(container: ParentNode) {
	const widgets = [...container.querySelectorAll<HTMLElement>('[data-rows-widget]')];
	const cells = [...container.querySelectorAll<HTMLElement>('[data-rows-cell]')];
	expect(widgets.length).toBe(2);
	expect(cells.length).toBe(4);

	cells[3]!.click();
	await expect.poll(() => widgets[1]!.getAttribute('data-marked')).toBe('right:b');
	expect(widgets[0]!.getAttribute('data-marked')).toBeNull();

	cells[0]!.click();
	await expect.poll(() => widgets[0]!.getAttribute('data-marked')).toBe('left:a');
	expect(widgets[1]!.getAttribute('data-marked')).toBe('right:b');
}

test('CSR: a keyed-repeat row handler reads its own widget element', async () => {
	const screen = await render(RowsPage);
	await expectRowReadsItsWidget(screen.container as HTMLElement);
});

test('SSR resume: a keyed-repeat row handler reads its own widget element', async () => {
	const screen = await renderSSR(RowsPage);
	await expectRowReadsItsWidget(screen.container);
});

// The genuine ambiguity: a handler that stands in no instance at all names none,
// so the read is still refused rather than answering with whichever registered.
async function expectOutsideRefused(container: ParentNode) {
	const levels = contents(container, 2);
	const outside = container.querySelector<HTMLButtonElement>('[data-outside]');

	outside!.click();
	await expect
		.poll(() => container.querySelector('[data-outside-page]')?.getAttribute('data-ran'))
		.toBe('1');
	expect(levels[0]!.getAttribute('data-outside-hit')).toBeNull();
	expect(levels[1]!.getAttribute('data-outside-hit')).toBeNull();
}

test('CSR: a page-level read of a two-instance handle is refused', async () => {
	const screen = await render(OutsidePage);
	await expectOutsideRefused(screen.container as HTMLElement);
});

test('SSR resume: a page-level read of a two-instance handle is refused', async () => {
	const screen = await renderSSR(OutsidePage);
	await expectOutsideRefused(screen.container);
});
