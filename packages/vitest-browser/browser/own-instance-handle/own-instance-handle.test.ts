import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, expect, test } from 'vitest';
import NestPage from './nest-page.tsrx';
import OutsidePage from './outside-page.tsrx';
import PairPage from './pair-page.tsrx';

// A handler on the part that BINDS a widget-scoped element() handle must reach
// its own instance's element, at any nesting depth.
afterEach(() => cleanup());

function levels(container: ParentNode, mark: string, expected: number) {
	const found = [...container.querySelectorAll<HTMLElement>(`[data-${mark}-content]`)];
	if (found.length !== expected)
		throw new Error(`Expected ${expected} ${mark} contents, saw ${found.length}.`);
	return found;
}

async function expectOwnElement(container: ParentNode) {
	const contents = levels(container, 'nest', 3);

	contents[2]!.click();
	await expect.poll(() => contents[2]!.getAttribute('data-clicked')).toBe('1');
	expect(contents[0]!.getAttribute('data-clicked')).toBeNull();
	expect(contents[1]!.getAttribute('data-clicked')).toBeNull();

	contents[1]!.click();
	await expect.poll(() => contents[1]!.getAttribute('data-clicked')).toBe('1');
	expect(contents[0]!.getAttribute('data-clicked')).toBeNull();
}

test('CSR: each level handler reaches its own instance element', async () => {
	const screen = await render(NestPage);
	await expectOwnElement(screen.container as HTMLElement);
});

test('SSR resume: each level handler reaches its own instance element', async () => {
	const screen = await renderSSR(NestPage);
	await expectOwnElement(screen.container as HTMLElement);
});

async function expectOwnCell(container: ParentNode) {
	const items = [...container.querySelectorAll<HTMLElement>('[data-nest-item]')];
	const contents = levels(container, 'nest', 3);

	contents[2]!.click();
	await expect.poll(() => items[2]!.getAttribute('data-hits')).toBe('1');
	expect(items[0]!.getAttribute('data-hits')).toBe('0');
	expect(items[1]!.getAttribute('data-hits')).toBe('0');
}

test('CSR: the same handler still writes its own instance cell', async () => {
	const screen = await render(NestPage);
	await expectOwnCell(screen.container as HTMLElement);
});

test('SSR resume: the same handler still writes its own instance cell', async () => {
	const screen = await renderSSR(NestPage);
	await expectOwnCell(screen.container as HTMLElement);
});

async function expectKeydownOwnElement(container: ParentNode) {
	const contents = levels(container, 'nest', 3);

	contents[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
	await expect.poll(() => contents[2]!.getAttribute('data-keyed')).toBe('ArrowDown');
	expect(contents[0]!.getAttribute('data-keyed')).toBeNull();
}

test('CSR: a keydown handler reaches its own instance element', async () => {
	const screen = await render(NestPage);
	await expectKeydownOwnElement(screen.container as HTMLElement);
});

test('SSR resume: a keydown handler reaches its own instance element', async () => {
	const screen = await renderSSR(NestPage);
	await expectKeydownOwnElement(screen.container as HTMLElement);
});

// The shape a menu needs: the ROOT part seeds the level family as well as the
// item, so the root's own surface is one level and the item's surface is the
// next. Both content parts have to reach their own element.
async function expectPairOwnElement(container: ParentNode) {
	const contents = levels(container, 'pair', 2);

	contents[1]!.click();
	await expect.poll(() => contents[1]!.getAttribute('data-clicked')).toBe('1');
	expect(contents[0]!.getAttribute('data-clicked')).toBeNull();
}

test('CSR: a root-seeded level and an item-seeded level each reach their own element', async () => {
	const screen = await render(PairPage);
	await expectPairOwnElement(screen.container as HTMLElement);
});

test('SSR resume: a root-seeded level and an item-seeded level each reach their own element', async () => {
	const screen = await renderSSR(PairPage);
	await expectPairOwnElement(screen.container as HTMLElement);
});

// The same page, asked of the cells: two levels means two instances, so the
// item's own click must leave the root's count alone.
async function expectPairOwnCell(container: ParentNode) {
	const contents = levels(container, 'pair', 2);

	contents[1]!.click();
	await expect
		.poll(() => container.querySelector('[data-pair-item]')?.getAttribute('data-hits'))
		.toBe('1');
	expect(container.querySelector('[data-pair-root]')?.getAttribute('data-hits')).toBe('0');
}

test('CSR: a root-seeded level and an item-seeded level are two instances', async () => {
	const screen = await render(PairPage);
	await expectPairOwnCell(screen.container as HTMLElement);
});

// A handler that is part of no rendered level names no instance, so the read
// stays refused rather than answering with whichever level registered.
async function expectOutsideRefused(container: ParentNode) {
	const contents = levels(container, 'nest', 2);
	const outside = container.querySelector<HTMLButtonElement>('[data-outside]');

	outside!.click();
	await expect
		.poll(() => container.querySelector('[data-outside-page]')?.getAttribute('data-ran'))
		.toBe('1');
	expect(contents[0]!.getAttribute('data-outside-hit')).toBeNull();
	expect(contents[1]!.getAttribute('data-outside-hit')).toBeNull();
}

test('CSR: a page-level read of a two-instance handle is refused', async () => {
	const screen = await render(OutsidePage);
	await expectOutsideRefused(screen.container as HTMLElement);
});

test('SSR resume: a page-level read of a two-instance handle is refused', async () => {
	const screen = await renderSSR(OutsidePage);
	await expectOutsideRefused(screen.container as HTMLElement);
});
