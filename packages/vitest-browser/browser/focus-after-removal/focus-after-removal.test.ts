import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ComponentRowPage from './component-row-page.tsrx';

import FlatSiblingPage from './flat-sibling-page.tsrx';

import KeyedRowPage from './keyed-row-page.tsrx';

// `browser/write-then-focus/` holds the runtime to "a handler's focus is landed
// by the time its write is visible" for an element the same commit REVEALS.
// These rows hold the same guarantee where the same commit takes the element
// focus was on out of the document: a keyed row removes itself and focuses its
// neighbour. The neighbour is live and connected when the handler focuses it,
// and the commit re-inserts the rows it kept - which resets the page to <body>.
//
// Every row waits on the WRITE and then reads `document.activeElement`
// synchronously; polling on focus would pass on a retry loop and prove nothing.
// Each page also records what `activeElement` was INSIDE the handler, right
// after its own `focus()` call, and that reading is the ordering claim: the call
// took, and the commit undid it. It is read last, and polled, because it is a
// report of a past fact rather than the thing under test.
//
// The pages report through `ui-*` attributes rather than text children because
// a text child derived from a collection does not refresh today
// (goals/headless-components/notes/U697-taglist-defects.md, finding 3); an
// attribute over the same cell does.

afterEach(async () => {
	await cleanup();
});

function el(testid: string): HTMLElement {
	return page.getByTestId(testid).element() as HTMLElement;
}

// Off the live row container rather than a document-wide selector: more than one
// page's markup can be on the document when a row reads its probe.
const atCall = (scope: HTMLElement) => () =>
	scope.closest('[data-focus-after-removal]')?.getAttribute('ui-at-call') ??
	scope.getAttribute('ui-at-call');
const closeFor = (scope: HTMLElement, tag: string) =>
	scope.querySelector<HTMLButtonElement>(`[data-close][value="${tag}"]`);
const tagsIn = (scope: HTMLElement) => () =>
	[...scope.querySelectorAll('[data-close]')].map((close) => close.getAttribute('value')).join('|');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Focus green's button, press Delete, wait on the write, hand back blue's. */
async function deleteGreen(scope: HTMLElement): Promise<HTMLButtonElement> {
	const blueBefore = closeFor(scope, 'blue')!;
	closeFor(scope, 'green')!.focus();
	expect(document.activeElement).toBe(closeFor(scope, 'green'));

	await userEvent.keyboard('{Delete}');
	await expect.poll(tagsIn(scope)).toBe('red|blue');
	return blueBefore;
}

async function expectLandedOnBlue(scope: HTMLElement, blue: HTMLButtonElement): Promise<void> {
	expect(document.activeElement).toBe(blue);
	await sleep(100);
	expect(document.activeElement).toBe(blue);
	await expect.poll(atCall(scope)).toBe('took');
}

test('CSR: a keyed row removes itself and focus lands on the neighbour it focused', async () => {
	await render(KeyedRowPage);
	const scope = el('tags');
	const blue = await deleteGreen(scope);

	// The neighbour is not a fresh node: the repeat kept it, so the element the
	// handler focused is the element this row reads back.
	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});

test('SSR: a keyed row removes itself and focus lands on the neighbour it focused', async () => {
	await renderSSR(KeyedRowPage);
	const scope = el('tags');
	const blue = await deleteGreen(scope);

	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});

test('CSR: a flat-sibling row removes itself and focus lands on the neighbour it focused', async () => {
	await render(FlatSiblingPage);
	const scope = el('tags');
	const blue = await deleteGreen(scope);

	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});

test('SSR: a flat-sibling row removes itself and focus lands on the neighbour it focused', async () => {
	await renderSSR(FlatSiblingPage);
	const scope = el('tags');
	const blue = await deleteGreen(scope);

	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});

// The @markless/ui shape, reduced: a widget-scope instance holds the collection
// and the plural close handle every row's button binds, each row roots its own
// instance, and the consumer's onChange writes its own array back through the
// root's prop. This is the shape that loses the focus - the two pages above keep
// it, so a keyed repeat alone is not the ingredient.
test('CSR: a component row removes itself and focus lands on the neighbour it focused', async () => {
	await render(ComponentRowPage);
	const scope = el('rows');
	const blue = await deleteGreen(scope);

	// The rows a repeat of component roots keeps are re-inserted, not left in
	// place: the button is the same node, and it was out of the document during
	// the commit, which is what dropped the focus the handler had landed on it.
	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});

test('SSR: a component row removes itself and focus lands on the neighbour it focused', async () => {
	await renderSSR(ComponentRowPage);
	const scope = el('rows');
	const blue = await deleteGreen(scope);

	expect(closeFor(scope, 'blue')).toBe(blue);
	await expectLandedOnBlue(scope, blue);
});
