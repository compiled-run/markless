import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/computed-module-const.tsrx';

// A component-body computed() that reads a module-scope declaration.
//
// The derive runs again in the browser every time its dependency changes, out of
// a module fetched on its own — so the `const` it reads has to be in that module.
// It was not: the name stayed free and the first re-derive threw a
// ReferenceError. Only the browser saw it. The server renders from the authored
// module, where the declaration is in scope, so SSR was green throughout and the
// first render of the resumed page was green too; the crash waited for the first
// state change. Both lanes are witnessed here for that reason — the SSR lane is
// not a duplicate, it is the lane that stayed green while the bug shipped.
afterEach(() => cleanup());

function text(container: ParentNode, selector: string) {
	return container.querySelector(selector)?.textContent;
}

function expectFirstRender(container: ParentNode) {
	expect(text(container, '[data-scaled]')).toBe('3');
	expect(text(container, '[data-via-class]')).toBe('3');
	expect(text(container, '[data-labelled]')).toBe('total:3');
}

async function expectReDerive(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-bump]')?.click();

	// This is the assertion the defect failed. Before the carry the click threw
	// `ReferenceError: RATE is not defined` inside the derive module, so the text
	// never moved off its first-render value.
	await expect.poll(() => text(container, '[data-scaled]')).toBe('6');
	expect(text(container, '[data-via-class]')).toBe('6');
	expect(text(container, '[data-labelled]')).toBe('total:6');

	container.querySelector<HTMLButtonElement>('[data-bump]')?.click();
	await expect.poll(() => text(container, '[data-scaled]')).toBe('9');
	expect(text(container, '[data-via-class]')).toBe('9');
	expect(text(container, '[data-labelled]')).toBe('total:9');
}

test('CSR: a computed reading a module-scope const renders it', async () => {
	const screen = await render(App);
	expectFirstRender(screen.container as HTMLElement);
});

test('CSR: a state change re-derives a computed that reads a module-scope const', async () => {
	const screen = await render(App);
	await expectReDerive(screen.container as HTMLElement);
});

test('SSR: a computed reading a module-scope const renders it', async () => {
	const screen = await renderSSR(App);
	expectFirstRender(screen.container);
});

test('SSR resume: a state change re-derives a computed that reads a module-scope const', async () => {
	const screen = await renderSSR(App);
	expectFirstRender(screen.container);
	await expectReDerive(screen.container);
});
