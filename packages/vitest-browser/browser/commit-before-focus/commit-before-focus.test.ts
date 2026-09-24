import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import DialogFieldPage from './dialog-field-page.tsrx';
import LaterFieldPage from './later-field-page.tsrx';

// A handler writes the cell bound onto a field's value, opens a dialog and
// focuses the field. Once the modules the commit uses are loaded, the write
// must be in the DOM before the task that ran the handler ends: a key pressed
// on the focused field, or a frame painted, sees the value the handler wrote.
// Every check here reads the DOM from the first task queued after the click,
// so a commit that waits a task for anything fails it.

afterEach(async () => {
	for (const dialog of document.querySelectorAll('dialog')) dialog.close();
	await cleanup();
});

const el = <T extends HTMLElement>(testid: string) => page.getByTestId(testid).element() as T;

type Seen = {
	readonly value: string;
	readonly active: Element | null;
	readonly selected: readonly [number | null, number | null];
	readonly valueAtFocus: string | undefined;
};

// Clicks and reads the page from the next task, selecting all of the field
// there the way a person's select-all shortcut would.
function clickThenReadNextTask(button: HTMLElement, field: HTMLInputElement): Promise<Seen> {
	let valueAtFocus: string | undefined;
	const onFocus = () => {
		valueAtFocus ??= field.value;
	};
	field.addEventListener('focus', onFocus);
	const seen = new Promise<Seen>((resolve) =>
		setTimeout(() => {
			field.removeEventListener('focus', onFocus);
			const active = document.activeElement;
			if (active === field) field.select();
			resolve({
				value: field.value,
				active,
				selected: [field.selectionStart, field.selectionEnd],
				valueAtFocus,
			});
		}, 0),
	);
	button.click();
	return seen;
}

async function openOnceAndClose(
	opener: string,
	field: string,
	expected: string,
	closer: string,
): Promise<void> {
	await userEvent.click(el(opener));
	await expect.poll(() => el<HTMLInputElement>(field).value).toBe(expected);
	await userEvent.click(el(closer));
	await expect.poll(() => el<HTMLInputElement>(field).closest('dialog')?.open).toBe(false);
}

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: the field a handler wrote holds its value in the task that opened the dialog`, async () => {
		if (mode === 'CSR') await render(DialogFieldPage);
		else await renderSSR(DialogFieldPage);
		await openOnceAndClose('edit', 'field', 'Record 1', 'close');

		const seen = await clickThenReadNextTask(el('edit'), el<HTMLInputElement>('field'));

		expect(seen.value).toBe('Record 2');
		expect(seen.active).toBe(el('field'));
		expect(seen.selected).toEqual([0, 'Record 2'.length]);
		expect(el<HTMLButtonElement>('save').disabled).toBe(false);
	});

	test(`${mode}: a field the handler focuses takes focus only once its value is written`, async () => {
		if (mode === 'CSR') await render(LaterFieldPage);
		else await renderSSR(LaterFieldPage);
		await openOnceAndClose('open', 'name', 'Name 1', 'dismiss');

		const seen = await clickThenReadNextTask(el('open'), el<HTMLInputElement>('name'));

		expect(seen.valueAtFocus).toBe('Name 2');
		expect(seen.value).toBe('Name 2');
		expect(seen.active).toBe(el('name'));
		expect(seen.selected).toEqual([0, 'Name 2'.length]);
	});
}
