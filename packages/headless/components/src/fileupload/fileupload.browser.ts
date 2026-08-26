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
import Accept from './scenarios/accept.tsrx';
import Basic from './scenarios/basic.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Form from './scenarios/form.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import TwoUploads from './scenarios/two-uploads.tsrx';

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

// The side is optional so the two-upload rows can ask for one upload's own parts
// while every single-upload row asks for the only ones on the page.
function names(side?: string) {
	const testid = side === undefined ? 'itemlabel' : `${side}-itemlabel`;
	return page.getByTestId(testid).elements().map((one) => one.textContent);
}

function fieldNames(side?: string) {
	const testid = side === undefined ? 'field' : `${side}-field`;
	return [...(el<HTMLInputElement>(testid).files ?? [])].map((one) => one.name);
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

test('CSR: with multiple, a second drop adds to the list', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('first.txt'));
	await expect.poll(() => names()).toEqual(['first.txt']);
	dropOn(el('droparea'), fileOf('second.txt'));
	await expect.poll(() => names()).toEqual(['first.txt', 'second.txt']);
	expect(fieldNames()).toEqual(['first.txt', 'second.txt']);
});

test('CSR: one drop of several files becomes several rows', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => names()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	expect(el<HTMLInputElement>('field').multiple).toBe(true);
});

// The same wall the basic suite pins: a repeat over widget-scoped state adds rows
// and never takes one away. The store underneath is right, which is what the row
// below this one measures.
test.fails('CSR: a remove button takes off its own row and leaves the rest', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => names()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	(page.getByTestId('itemclose').elements()[1] as HTMLButtonElement).click();
	await expect.poll(() => names()).toEqual(['a.txt', 'c.txt']);
});

test('CSR: a remove takes its own file off the field and leaves the rest', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('a.txt'), fileOf('b.txt'), fileOf('c.txt'));
	await expect.poll(() => fieldNames()).toEqual(['a.txt', 'b.txt', 'c.txt']);
	(page.getByTestId('itemclose').elements()[1] as HTMLButtonElement).click();
	await expect.poll(() => fieldNames()).toEqual(['a.txt', 'c.txt']);
});

// Two files can share a name, so the row a remove acts on is identified by the id
// minted for it rather than by what it is called.
test('CSR: two files of the same name are told apart by the remove', async () => {
	await render(Multiple);
	dropOn(el('droparea'), fileOf('same.txt', 'text/plain', 'first'));
	dropOn(el('droparea'), fileOf('same.txt', 'text/plain', 'second'));
	await expect.poll(() => names()).toEqual(['same.txt', 'same.txt']);
	(page.getByTestId('itemclose').elements()[0] as HTMLButtonElement).click();
	await expect.poll(() => fieldNames()).toEqual(['same.txt']);
	expect([...(el<HTMLInputElement>('field').files ?? [])][0]?.size).toBe(6);
});

test('CSR: the accept list is on the field the picker opens from', async () => {
	await render(Accept);
	expect(el<HTMLInputElement>('field').accept).toBe('image/*');
});

// The browser applies accept to the picker and never to a drop, so without the
// family filtering it a dropped text file would land in an images-only upload.
test('CSR: a dropped file the accept list rejects never arrives', async () => {
	await render(Accept);
	dropOn(el('droparea'), fileOf('notes.txt', 'text/plain'));
	dropOn(el('droparea'), fileOf('photo.png', 'image/png'));
	await expect.poll(() => names()).toEqual(['photo.png']);
	expect([...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name)).toEqual([
		'photo.png',
	]);
});

test('CSR: one drop keeps what the accept list allows and drops the rest', async () => {
	await render(Accept);
	dropOn(el('droparea'), fileOf('a.png', 'image/png'), fileOf('b.pdf', 'application/pdf'));
	await expect.poll(() => names()).toEqual(['a.png']);
});

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

// The whole point of keeping the real input's own list in step: a file that only
// ever arrived by drop is not in it otherwise, and the form would send nothing.
// The form's own FormData is read rather than submitted, because a real submit
// navigates the test page away.
test('CSR: the form would send the dropped files', async () => {
	await render(Form);
	dropOn(el('droparea'), fileOf('one.txt'), fileOf('two.txt'));
	await expect
		.poll(() => [...(el<HTMLInputElement>('field').files ?? [])].map((one) => one.name))
		.toEqual(['one.txt', 'two.txt']);
	const data = new FormData(el<HTMLFormElement>('form'));
	expect(data.getAll('attachment').map((one) => (one instanceof File ? one.name : one))).toEqual([
		'one.txt',
		'two.txt',
	]);
});

test('CSR: an upload with nothing chosen sends no file', async () => {
	await render(Form);
	const data = new FormData(el<HTMLFormElement>('form'));
	const sent = data.getAll('attachment').filter((one) => one instanceof File && one.size > 0);
	expect(sent).toEqual([]);
});

test('CSR: the field submits under the name the root was given', async () => {
	await render(Form);
	expect(el<HTMLInputElement>('field').name).toBe('attachment');
});

test('CSR: two uploads on one page keep their own files', async () => {
	await render(TwoUploads);
	dropOn(el('left-droparea'), fileOf('left.txt'));
	await expect.poll(() => names('left')).toEqual(['left.txt']);
	expect(names('right')).toEqual([]);
	dropOn(el('right-droparea'), fileOf('right.txt'));
	await expect.poll(() => names('right')).toEqual(['right.txt']);
	expect(names('left')).toEqual(['left.txt']);
	expect(fieldNames('left')).toEqual(['left.txt']);
	expect(fieldNames('right')).toEqual(['right.txt']);
});

test('CSR: two uploads on one page keep their own names and labels', async () => {
	await render(TwoUploads);
	const left = el<HTMLInputElement>('left-field');
	const right = el<HTMLInputElement>('right-field');
	expect(left.name).toBe('left');
	expect(right.name).toBe('right');
	expect(left.id).not.toBe(right.id);
	expect(el<HTMLLabelElement>('left-label').getAttribute('for')).toBe(left.id);
	expect(el<HTMLLabelElement>('right-label').getAttribute('for')).toBe(right.id);
});
