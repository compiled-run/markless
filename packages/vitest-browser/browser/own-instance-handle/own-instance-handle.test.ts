import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import NestPage from './nest-page.tsrx';
import OutsidePage from './outside-page.tsrx';
import PairPage from './pair-page.tsrx';

// A handler on the part that BINDS a widget-scoped element() handle must reach
// its own instance's element, at any nesting depth.
afterEach(() => cleanup());

const AMBIGUOUS = 'MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS';

// A resume refusal that runs off a handler lands on the window, and every row
// here is a page whose handlers are supposed to resolve or to catch. Anything
// this collects is an escaped refusal, not a passing row's business.
const escaped: string[] = [];

beforeEach(() => {
	escaped.length = 0;
	const note = (reason: unknown) => {
		const code = (reason as { readonly code?: string } | null)?.code;
		if (typeof code !== 'string') return false;
		escaped.push(code);
		return true;
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		if (note(event.reason)) event.preventDefault();
	};
	const onError = (event: ErrorEvent) => {
		if (note(event.error)) event.preventDefault();
	};
	window.addEventListener('unhandledrejection', onRejection);
	window.addEventListener('error', onError);
	return () => {
		window.removeEventListener('unhandledrejection', onRejection);
		window.removeEventListener('error', onError);
	};
});

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

// The shape a root-plus-items surface actually takes: the root seeds one family
// and every item seeds a second, so the root's surface and the item's surface
// are separate instances. Each content part has to reach its own element.
async function expectPairOwnElement(container: ParentNode) {
	const contents = levels(container, 'pair', 2);

	contents[1]!.click();
	await expect.poll(() => contents[1]!.getAttribute('data-clicked')).toBe('1');
	expect(contents[0]!.getAttribute('data-clicked')).toBeNull();
}

test('CSR: the root family and the item family each reach their own element', async () => {
	const screen = await render(PairPage);
	await expectPairOwnElement(screen.container as HTMLElement);
});

test('SSR resume: the root family and the item family each reach their own element', async () => {
	const screen = await renderSSR(PairPage);
	await expectPairOwnElement(screen.container as HTMLElement);
});

// The same page, asked of the cells: two families means two instances, so a
// click on the inner content counts on the inner level alone.
async function expectPairOwnCell(container: ParentNode) {
	const contents = levels(container, 'pair', 2);

	contents[1]!.click();
	await expect
		.poll(() => container.querySelector('[data-pair-item]')?.getAttribute('data-hits'))
		.toBe('1');
	expect(container.querySelector('[data-pair-root]')?.getAttribute('data-hits')).toBe('0');
}

test('CSR: the root family and the item family are two instances', async () => {
	const screen = await render(PairPage);
	await expectPairOwnCell(screen.container as HTMLElement);
});

test('SSR resume: the root family and the item family are two instances', async () => {
	const screen = await renderSSR(PairPage);
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
	// The refusal is loud where it was asked, and it stops there.
	await expect
		.poll(() => container.querySelector('[data-outside-page]')?.getAttribute('data-refused'))
		.toBe(AMBIGUOUS);
	expect(escaped).toEqual([]);
}

// Every level of the nest, clicked in turn: a handler reading the handle its own
// level binds resolves that level, so no read falls back to the page-wide key
// and no refusal runs off a handler onto the window.
async function expectNoEscapedRefusal(container: ParentNode) {
	const contents = levels(container, 'nest', 3);

	for (const [index, content] of contents.entries()) {
		content.click();
		await expect.poll(() => content.getAttribute('data-clicked')).toBe('1');
		for (const [other, sibling] of contents.entries())
			if (other > index) expect(sibling.getAttribute('data-clicked')).toBeNull();
	}
	expect(escaped).toEqual([]);
}

test('CSR: no refusal escapes the nest levels onto the window', async () => {
	const screen = await render(NestPage);
	await expectNoEscapedRefusal(screen.container as HTMLElement);
});

test('SSR resume: no refusal escapes the nest levels onto the window', async () => {
	const screen = await renderSSR(NestPage);
	await expectNoEscapedRefusal(screen.container as HTMLElement);
});

test('CSR: a page-level read of a two-instance handle is refused', async () => {
	const screen = await render(OutsidePage);
	await expectOutsideRefused(screen.container as HTMLElement);
});

test('SSR resume: a page-level read of a two-instance handle is refused', async () => {
	const screen = await renderSSR(OutsidePage);
	await expectOutsideRefused(screen.container as HTMLElement);
});
