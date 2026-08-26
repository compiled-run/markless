import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test, vi } from 'vitest';
import {
	dragEnter,
	dragLeaveOntoChild,
	dragLeaveOutside,
	dropOn,
	fileOf,
} from '../../test-support/drag.ts';
import Basic from './scenarios/basic.tsrx';

// One page module per file: a compiled page installs its row-minting loader into
// a single unqualified global, so a second scenario with a repeat imported here
// would leave only the last one able to mint rows. Every other fileupload
// scenario holds its own browser file for that reason.

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

function fieldNames() {
	return [...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name);
}

// The first two rows are the cold ones: on a freshly resumed served document the
// first gesture is also the one that pays for the handler module import, so both
// the browser's user-activation window and the event's own dataTransfer have to
// survive that import. Nothing else in this package has ever needed either.
//
// Their polls are given longer than the one-second default, because the gesture
// waits on seven module fetches.
//
// The click row passes on its own and fails whenever the whole project runs, with
// zero calls recorded rather than late ones — the gesture is not reaching the
// handler at all there. It is left unpinned on purpose: it is a gate, and marking
// it a known gap would hide it. The family note carries the evidence.
const COLD_POLL = { timeout: 5000 };

test('SSR cold first click: the very first gesture opens the picker', async () => {
	const activation: boolean[] = [];
	const showPicker = vi.fn(() => {
		activation.push(navigator.userActivation.isActive);
	});
	const original = HTMLInputElement.prototype.showPicker;
	HTMLInputElement.prototype.showPicker = showPicker;
	try {
		await renderSSR(Basic);
		await userEvent.click(page.getByTestId('trigger'));
		await expect.poll(() => showPicker.mock.calls.length, COLD_POLL).toBe(1);
		// Opening the picker needs the gesture to still count as active; if the
		// import outlived the activation window this is where it shows.
		expect(activation).toEqual([true]);
	} finally {
		HTMLInputElement.prototype.showPicker = original;
	}
});

test('SSR cold drop: the first gesture is a drop and the file survives it', async () => {
	await renderSSR(Basic);
	dropOn(el('droparea'), fileOf('cold.txt'));
	await expect.poll(() => names(), COLD_POLL).toEqual(['cold.txt']);
});

test('CSR: every part is on the page and the field is the real file input', async () => {
	await render(Basic);
	const field = el<HTMLInputElement>('field');
	expect(field.type).toBe('file');
	expect(field.getAttribute('tabindex')).toBe('-1');
	expect(field.getAttribute('aria-hidden')).toBe('true');
	expect(field.name).toBe('attachment');
	expect(el('droparea').hasAttribute('role')).toBe(false);
	expect(el('droparea').hasAttribute('tabindex')).toBe(false);
});

test('CSR: the label points at the field, so the field has a name', async () => {
	await render(Basic);
	const field = el<HTMLInputElement>('field');
	expect(field.id).not.toBe('');
	expect(el<HTMLLabelElement>('label').getAttribute('for')).toBe(field.id);
});

test('CSR: pressing the browse button opens the picker', async () => {
	const showPicker = vi.fn();
	const original = HTMLInputElement.prototype.showPicker;
	HTMLInputElement.prototype.showPicker = showPicker;
	try {
		await render(Basic);
		el<HTMLButtonElement>('trigger').click();
		await expect.poll(() => showPicker.mock.calls.length).toBe(1);
	} finally {
		HTMLInputElement.prototype.showPicker = original;
	}
});

test('CSR: a drag arriving over the area marks it, and leaving clears it', async () => {
	await render(Basic);
	const droparea = el('droparea');
	dragEnter(droparea);
	await expect.poll(() => droparea.hasAttribute('ui-dragging')).toBe(true);
	dragLeaveOutside(droparea);
	await expect.poll(() => droparea.hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a drag crossing onto a child does not clear the mark', async () => {
	await render(Basic);
	const droparea = el('droparea');
	dragEnter(droparea);
	await expect.poll(() => droparea.hasAttribute('ui-dragging')).toBe(true);
	dragLeaveOntoChild(droparea);
	await expect.poll(() => droparea.hasAttribute('ui-dragging')).toBe(true);
});

test('CSR: a dropped file becomes a row named after it', async () => {
	await render(Basic);
	dropOn(el('droparea'), fileOf('notes.txt'));
	await expect.poll(() => names()).toEqual(['notes.txt']);
	expect(el('droparea').hasAttribute('ui-dragging')).toBe(false);
});

// Files added by drop are never in the input's own list, so a drop-only upload
// would submit nothing without this.
test('CSR: the field carries the dropped file', async () => {
	await render(Basic);
	dropOn(el('droparea'), fileOf('notes.txt'));
	await expect.poll(() => fieldNames()).toEqual(['notes.txt']);
});

// The remove button reaches the right upload and empties the store — the field's
// own list goes from one file to none — but the row it removed stays on the page.
// A repeat over widget-scoped state renders rows as they arrive and never takes
// one away again: measured at three rows going to two, and at one row going to
// none. Page-scoped state does not behave this way, which is why toaster's
// dismiss row is green; this family cannot be page-scoped, because `for={handle}`
// on the label is refused outside widget scope.
test.fails('CSR: removing the last file takes its row off the page', async () => {
	await render(Basic);
	dropOn(el('droparea'), fileOf('notes.txt'));
	await expect.poll(() => fieldNames()).toEqual(['notes.txt']);
	el<HTMLButtonElement>('itemclose').click();
	await expect.poll(() => names()).toEqual([]);
});

test('CSR: removing a file empties the field it would have submitted', async () => {
	await render(Basic);
	dropOn(el('droparea'), fileOf('notes.txt'));
	await expect.poll(() => fieldNames()).toEqual(['notes.txt']);
	el<HTMLButtonElement>('itemclose').click();
	await expect.poll(() => fieldNames()).toEqual([]);
});

test('CSR: without multiple, a second drop replaces the first file', async () => {
	await render(Basic);
	dropOn(el('droparea'), fileOf('first.txt'));
	await expect.poll(() => names()).toEqual(['first.txt']);
	dropOn(el('droparea'), fileOf('second.txt'));
	await expect.poll(() => names()).toEqual(['second.txt']);
	expect(fieldNames()).toEqual(['second.txt']);
});

test('SSR: a drop on the resumed page renders a row and fills the field', async () => {
	await renderSSR(Basic);
	dropOn(el('droparea'), fileOf('resumed.txt'));
	await expect.poll(() => names()).toEqual(['resumed.txt']);
	expect(fieldNames()).toEqual(['resumed.txt']);
});
