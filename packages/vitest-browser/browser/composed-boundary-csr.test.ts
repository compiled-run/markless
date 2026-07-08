import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../src/index.ts';
import OrchardPage from './fixtures/orchard-page.tsrx';
import OrchardSibling from './fixtures/orchard-sibling.tsrx';

// Composed child-owned async boundaries on CSR mounts (the client-swap render
// path): the child's compile-time per-arm record arrays are not positionally
// trustworthy after composition, so the CSR compose step must armize the live
// @pending arm in the child's own coordinate space and prefix the record set.
// Without that, in-arm records silently die after client swaps (the
// "deliberately not registrable" fail-close in resume-arm-records).
afterEach(() => cleanup());

function queryContainer(container: unknown): HTMLElement {
	return container as HTMLElement;
}

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: a composed child-owned boundary mounts @pending with LIVE arm records, settles, and its @try arm button fires', async () => {
	const screen = await render(OrchardPage);
	const container = queryContainer(screen.container);

	// CSR mounts paint the child's @pending arm.
	expect(container.querySelector('p[data-wait]')?.textContent).toBe('Sprouting');

	// Pending-arm interactivity: the arm record set registered at mount (in
	// the child's own coordinate space, prefixed) dispatches immediately.
	requireElement<HTMLButtonElement>(container, 'button[data-wave]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('waved');

	// The boundary settles through the c0:-prefixed update symbol.
	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Rhubarb spring');
	expect(container.querySelector('div.sprouting')).toBeNull();

	// THE acceptance behavior: in-arm events fire after a client swap into a
	// composed child boundary.
	requireElement<HTMLButtonElement>(container, 'button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb spring');
});

test('CSR: a composed child-owned boundary re-settles after mount and the fresh arm stays interactive', async () => {
	const screen = await render(OrchardPage);
	const container = queryContainer(screen.container);

	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Rhubarb spring');

	requireElement<HTMLButtonElement>(container, 'button[data-reseed]').click();
	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Rhubarb summer');

	requireElement<HTMLButtonElement>(container, 'button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb summer');
});

test('CSR: a page-owned boundary BESIDE a composed child-owned boundary — both settle and both arms dispatch', async () => {
	const screen = await render(OrchardSibling);
	const container = queryContainer(screen.container);

	// Both boundaries settle from one CSR mount (independent runners).
	await expect
		.poll(() => container.querySelector('main > [data-crop]')?.textContent)
		.toBe('Clear');
	await expect
		.poll(() => container.querySelector('[data-panel] [data-crop]')?.textContent)
		.toBe('Rhubarb spring');

	// Page-owned arm records and composed child arm records both dispatch.
	requireElement<HTMLButtonElement>(container, 'button[data-note]').click();
	await expect
		.poll(() => container.querySelector('output[data-noted]')?.textContent)
		.toBe('noted:Clear');
	requireElement<HTMLButtonElement>(container, '[data-panel] button[data-pick]').click();
	await expect
		.poll(() => container.querySelector('[data-panel] output[data-picked]')?.textContent)
		.toBe('picked:Rhubarb spring');
});
