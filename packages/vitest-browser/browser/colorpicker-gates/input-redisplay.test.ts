import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { cellTextAt, dragAcross, expectCell, expectDisplayed, fieldAt } from './gestures.ts';
import Page from './page.tsrx';

// An input's displayed text is its `value` property, and that property stops
// following the `value` attribute the moment a person types into the element.
// Every row here types first, so every write under test lands on a dirtied
// input - the only case the colorpicker's typed entry needs.
afterEach(() => cleanup());

const typed = '#ff000';
// A click parks the caret past the seed, so typing appends to it.
const afterTyping = `#000000${typed}`;

/** Leave the field dirty, the only state in which the re-display question bites. */
async function typeInto(testid: string): Promise<void> {
	await userEvent.click(page.getByTestId(testid));
	await userEvent.keyboard(typed);
}

test('CSR: a button write re-displays an input the person typed into', async () => {
	await render(Page);
	await typeInto('one-way');
	expect(fieldAt('one-way').value).toBe(afterTyping);

	await userEvent.click(page.getByTestId('one-way-write'));
	await expectCell('one-way-cell', '#00ff00');
	await expectDisplayed('one-way', '#00ff00');
});

test('SSR: a button write re-displays an input the person typed into', async () => {
	await renderSSR(Page);
	await typeInto('one-way');
	await expectDisplayed('one-way', afterTyping);

	await userEvent.click(page.getByTestId('one-way-write'));
	await expectCell('one-way-cell', '#00ff00');
	await expectDisplayed('one-way', '#00ff00');
});

test('CSR: a pointer drag on a sibling re-displays the typed-into input', async () => {
	await render(Page);
	await typeInto('dragged');
	expect(fieldAt('dragged').value).toBe(afterTyping);

	dragAcross('drag-area');
	await expectCell('dragged-cell', '#445566');
	await expectDisplayed('dragged', '#445566');
});

test('SSR: a pointer drag on a sibling re-displays the typed-into input', async () => {
	await renderSSR(Page);
	await typeInto('dragged');
	await expectDisplayed('dragged', afterTyping);

	dragAcross('drag-area');
	await expectCell('dragged-cell', '#445566');
	await expectDisplayed('dragged', '#445566');
});

test('CSR: a two-way input round-trips typing and still takes an outside write', async () => {
	await render(Page);
	await typeInto('two-way');

	await expectCell('two-way-cell', afterTyping);
	expect(fieldAt('two-way').value).toBe(afterTyping);
	expect(fieldAt('two-way').selectionStart).toBe(afterTyping.length);

	await userEvent.click(page.getByTestId('two-way-write'));
	await expectCell('two-way-cell', '#00ff00');
	await expectDisplayed('two-way', '#00ff00');
});

test('SSR: a two-way input round-trips typing and still takes an outside write', async () => {
	await renderSSR(Page);
	await typeInto('two-way');

	await expectCell('two-way-cell', afterTyping);
	await expectDisplayed('two-way', afterTyping);

	await userEvent.click(page.getByTestId('two-way-write'));
	await expectCell('two-way-cell', '#00ff00');
	await expectDisplayed('two-way', '#00ff00');
});

// Typing into the middle is the caret probe: a write-back that reassigns the
// value property parks the caret at the end, and the character lands there too.
test('CSR: a two-way input keeps the caret where the person put it', async () => {
	await render(Page);
	const field = page.getByTestId('two-way');
	await userEvent.click(field);
	await userEvent.keyboard('{Home}');
	await userEvent.keyboard('abc');

	await expect.poll(() => cellTextAt('two-way-cell')).toBe('abc#000000');
	expect(fieldAt('two-way').value).toBe('abc#000000');
	expect(fieldAt('two-way').selectionStart).toBe(3);
});

// A color input has no text entry, so the person's edit arrives through the UA
// picker: script-setting `value` sets the same dirty value flag typing does.
test('CSR: a button write re-displays a dirtied input type=color', async () => {
	await render(Page);
	expect(fieldAt('native').value).toBe('#000000');
	fieldAt('native').value = '#ff0000';

	await userEvent.click(page.getByTestId('native-write'));
	await expectCell('native-cell', '#00ff00');
	await expectDisplayed('native', '#00ff00');
});

test('SSR: a button write re-displays a dirtied input type=color', async () => {
	await renderSSR(Page);
	await expectDisplayed('native', '#000000');
	fieldAt('native').value = '#ff0000';

	await userEvent.click(page.getByTestId('native-write'));
	await expectCell('native-cell', '#00ff00');
	await expectDisplayed('native', '#00ff00');
});
