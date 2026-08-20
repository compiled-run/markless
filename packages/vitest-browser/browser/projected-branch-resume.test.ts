import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/projected-branch-page.tsrx';

// An `@if` inside a PROJECTED part: the branch belongs to a component the page
// composes, and its arm shows the children the page projected into that
// component. Two things used to stop this after a server render:
//
//   - a same-module component's SSR render dropped every branch record it had
//     just anchored, so the browser never wired the flip at all; and
//   - the arm rebuild reads the projected children back out of the component's
//     own prop cell, which only a CSR mount seeded.
//
// `<Note>` is the control: same shared field, same gesture, arm markup its own.
afterEach(() => cleanup());

async function expectBothArmsFlip(container: ParentNode) {
	expect(container.querySelector('[data-panel-body]')?.textContent).toBe('');
	expect(container.querySelector('[data-panel-note]')?.textContent).toBe('');

	container.querySelector<HTMLButtonElement>('[data-panel-handle]')?.click();

	// The projected arm rebuilds its own static mark AND the projected children.
	await expect.poll(() => container.querySelector('[data-panel-body]')?.textContent).toBe(
		'+details',
	);
	expect(container.querySelector('[data-panel-mark]')?.textContent).toBe('+');
	expect(container.querySelector('[data-panel-note]')?.textContent).toBe('shown');
	expect(container.querySelector('[data-panel]')?.getAttribute('data-expanded')).toBe('true');
}

test('CSR: a branch in a projected part shows the projected children', async () => {
	const screen = await render(Page);
	await expectBothArmsFlip(screen.container as HTMLElement);
});

test('SSR: a branch in a projected part shows the projected children after resume', async () => {
	const screen = await renderSSR(Page);
	await expectBothArmsFlip(screen.container);
});
