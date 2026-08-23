import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RowBoundSymbolPage from './fixtures/row-bound-symbol.tsrx';

afterEach(() => cleanup());

// A component placed under an `@if` arm inside a value-keyed `@for` row is the
// row's own instance: its state cells live under the row's `r:<key>:` segment.
// The handler compiled for it is a BOUND symbol, whose id carries only the
// build-time branch/repeat scope - no row value. Unless the dispatched record's
// row segment reaches the symbol's execution context, the write either lands
// nowhere or, worse, silently lands on another row. Both rows are asserted on
// every click for exactly that reason.
function counter(container: HTMLElement, label: string): HTMLButtonElement {
	const found = container.querySelector<HTMLButtonElement>(`[data-counter="${label}"]`);
	if (!found) throw new Error(`Expected the ${label} row's counter button.`);
	return found;
}

function readings(container: HTMLElement): Record<string, string> {
	return {
		alpha: counter(container, 'alpha').textContent ?? '',
		beta: counter(container, 'beta').textContent ?? '',
	};
}

// The callback the row passed down is the page's OWN cell, reached through the
// bound symbol's capture adapter. Threading the row must not drag that read into
// the row's space, so every row's click is counted here in page space.
function bumps(container: HTMLElement): string {
	return container.querySelector('[data-bumps]')?.textContent ?? '';
}

test('CSR: a bound symbol under an arm in a keyed row writes its own row', async () => {
	const screen = await render(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(readings(container)).toEqual({ alpha: '0', beta: '0' });

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('1');
	// The dangerous failure is the silent wrong-row write, so alpha is asserted too.
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('2');
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'alpha').click();
	await expect.poll(() => counter(container, 'alpha').textContent).toBe('1');
	expect(counter(container, 'beta').textContent).toBe('2');

	// Three clicks across two rows, counted once each on the page's own cell.
	await expect.poll(() => bumps(container)).toBe('3');
});

test('SSR: a resumed bound symbol under an arm in a keyed row writes its own row', async () => {
	const screen = await renderSSR(RowBoundSymbolPage);
	const container = screen.container as HTMLElement;
	expect(readings(container)).toEqual({ alpha: '0', beta: '0' });

	counter(container, 'beta').click();
	await expect.poll(() => counter(container, 'beta').textContent).toBe('1');
	expect(counter(container, 'alpha').textContent).toBe('0');

	counter(container, 'alpha').click();
	await expect.poll(() => counter(container, 'alpha').textContent).toBe('1');
	expect(counter(container, 'beta').textContent).toBe('1');

	await expect.poll(() => bumps(container)).toBe('2');
});
