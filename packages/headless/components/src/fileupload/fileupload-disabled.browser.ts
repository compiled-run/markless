import { cleanup, render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test, vi } from 'vitest';
import { dragEnter, dropOn, fileOf } from '../../test-support/drag.ts';
import Disabled from './scenarios/disabled.tsrx';

// Its own file: a compiled page installs its row-minting loader into a single
// unqualified global, so two scenarios with a repeat cannot share one suite.

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

function names() {
	return page.getByTestId('itemlabel').elements().map((one) => one.textContent);
}

test('CSR: a disabled upload reports it on every part that can be pressed', async () => {
	await render(Disabled);
	expect(el('root').hasAttribute('ui-disabled')).toBe(true);
	expect(el<HTMLButtonElement>('trigger').disabled).toBe(true);
	expect(el<HTMLInputElement>('field').disabled).toBe(true);
	expect(el('droparea').hasAttribute('ui-disabled')).toBe(true);
});

// The guard is written as a positive `if` around preventDefault for exactly this
// row: written as an early return the compiler would hoist the cancel as
// unconditional, the browser would hand the page the drop, and a disabled upload
// would quietly accept files.
test('CSR: a drop on a disabled upload adds nothing', async () => {
	await render(Disabled);
	dropOn(el('droparea'), fileOf('notes.txt'));
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(names()).toEqual([]);
	expect([...(el<HTMLInputElement>('field').files ?? [])]).toEqual([]);
});

test('CSR: a drag over a disabled upload never marks it', async () => {
	await render(Disabled);
	dragEnter(el('droparea'));
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(el('droparea').hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a disabled upload never opens the picker', async () => {
	const showPicker = vi.fn();
	const original = HTMLInputElement.prototype.showPicker;
	HTMLInputElement.prototype.showPicker = showPicker;
	try {
		await render(Disabled);
		el<HTMLButtonElement>('trigger').click();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(showPicker).not.toHaveBeenCalled();
	} finally {
		HTMLInputElement.prototype.showPicker = original;
	}
});
