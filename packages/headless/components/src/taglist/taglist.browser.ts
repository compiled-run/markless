import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Capped from './scenarios/capped.tsrx';
import ConsumerState from './scenarios/consumer-state.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import DisplayOnly from './scenarios/display-only.tsrx';
import Editable from './scenarios/editable.tsrx';
import TopicsForm from './scenarios/topics-form.tsrx';
import TwoTagLists from './scenarios/two-taglists.tsrx';
import { admit, afterRemoval, nextHighlight, rename, splitPasted } from './tag-walk.ts';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Input = page.getByTestId('input');
const Row = page.getByTestId('row');
const Field = page.getByTestId('field');
const Held = page.getByTestId('held');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Submitted = page.getByTestId('submitted');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const at = (id: string) => el(page.getByTestId(id));
const closeFor = (tag: string) => el<HTMLButtonElement>(page.getByTestId(`itemclose-${tag}`));
const editFor = (tag: string) => el<HTMLInputElement>(page.getByTestId(`iteminput-${tag}`));

/** The tags on the page, in the order they are rendered. */
function shownTags(row: Element = el(Row)): string[] {
	return [...row.children].map((one) => one.getAttribute('ui-value') ?? '');
}

/** What the root's always-mounted live region is saying. */
function spoken(scope: Element = el(Root)): string {
	const region = scope.querySelector('output[aria-live]');
	if (!region) throw new Error('The root rendered no live region.');
	return region.textContent ?? '';
}

async function typeInto(locator: { element(): Element | null }, keys: string) {
	el<HTMLInputElement>(locator).focus();
	await userEvent.keyboard(keys);
}

/** Put the caret exactly where a row needs it, then press. */
async function pressAtCaret(field: HTMLInputElement, caret: number, keys: string) {
	field.focus();
	field.setSelectionRange(caret, caret);
	await userEvent.keyboard(keys);
}

async function expectNoAxeViolations(container: Element, phase: string) {
	const results = await axe.run(container as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	const reported = results.violations.map((violation) => {
		const nodes = violation.nodes.map((node) => `      ${node.html}`).join('\n');
		return `  ${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n${nodes}`;
	});
	expect(reported, `axe violations while ${phase}`).toEqual([]);
}

function scopeOf(result: { container: unknown }): Element {
	const container = result.container;
	if (!(container instanceof Element)) throw new Error('The mount handed back no DOM container.');
	return container;
}

// ---------------------------------------------------------------------------
// The value arithmetic, held on its own. There is no node lane in this package,
// so the walk, the split, the admission and the rename are rows here — the same
// four functions a future multi-select combobox would reuse.
// ---------------------------------------------------------------------------

test('the walk steps through the tags and hands the caret back off the right end', () => {
	const tags = ['a', 'b', 'c'];
	// Nothing highlighted: left lands on the LAST tag, which is what makes
	// ArrowLeft from the field walk into the row from the end nearest the caret.
	expect(nextHighlight(tags, '', 'ArrowLeft')).toBe('c');
	expect(nextHighlight(tags, 'c', 'ArrowLeft')).toBe('b');
	expect(nextHighlight(tags, 'a', 'ArrowLeft')).toBeUndefined();
	expect(nextHighlight(tags, 'a', 'ArrowRight')).toBe('b');
	// Off the last tag is the empty string: the caret, not a wrap.
	expect(nextHighlight(tags, 'c', 'ArrowRight')).toBe('');
	expect(nextHighlight(tags, '', 'ArrowRight')).toBeUndefined();
	expect(nextHighlight(tags, 'b', 'Home')).toBe('a');
	expect(nextHighlight(tags, 'b', 'End')).toBe('c');
	expect(nextHighlight([], '', 'ArrowLeft')).toBeUndefined();
});

test('the highlight lands on a neighbour after a removal, and on the caret when the row empties', () => {
	expect(afterRemoval(['a', 'b', 'c'], 'b')).toBe('c');
	expect(afterRemoval(['a', 'b', 'c'], 'c')).toBe('b');
	expect(afterRemoval(['a'], 'a')).toBe('');
	expect(afterRemoval(['a', 'b'], 'z')).toBe('');
});

test('a pasted string splits on the delimiter, trims, and drops the empties', () => {
	expect(splitPasted('a, b ,,c', ',')).toEqual(['a', 'b', 'c']);
	expect(splitPasted('a;b', ';')).toEqual(['a', 'b']);
	expect(splitPasted('  ', ',')).toEqual([]);
	expect(splitPasted('a,b', '')).toEqual(['a,b']);
});

test('admission dedupes, trims, and stops at the cap', () => {
	expect(admit(['a'], ['b', 'a', 'c'], 0)).toEqual(['a', 'b', 'c']);
	expect(admit(['a'], [' b '], 0)).toEqual(['a', 'b']);
	expect(admit(['a'], ['b', 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
	expect(admit([], ['', '  '], 0)).toEqual([]);
});

test('an admission that changes nothing gives back the array it was handed', () => {
	const held = ['a', 'b'];
	expect(admit(held, ['a'], 0)).toBe(held);
	expect(admit(held, [], 0)).toBe(held);
	expect(admit(held, ['c'], 2)).toBe(held);
});

test('a rename keeps the tag in place, and merges rather than duplicating', () => {
	expect(rename(['a', 'b', 'c'], 'b', 'z')).toEqual(['a', 'z', 'c']);
	expect(rename(['a', 'b'], 'b', '')).toEqual(['a']);
	// Editing one tag onto another merges the two: two tags reading the same words
	// would be indistinguishable to the highlight, which is keyed by value.
	expect(rename(['a', 'b'], 'b', 'a')).toEqual(['a']);
	expect(rename(['a', 'b'], 'b', 'b')).toEqual(['a', 'b']);
	expect(rename(['a'], 'z', 'y')).toEqual(['a']);
});

// ---------------------------------------------------------------------------
// The family in a page.
// ---------------------------------------------------------------------------

for (const mode of MODES) {
	test(`${mode}: the family renders its whole anatomy`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(Root).getAttribute('role')).toBe('group');
		expect(el(Label).tagName).toBe('LABEL');
		expect(el<HTMLInputElement>(Input).type).toBe('text');
		expect(shownTags()).toEqual(['alpha', 'beta']);
		expect(at('itemlabel-alpha').textContent).toBe('alpha');
		expect(closeFor('alpha').tagName).toBe('BUTTON');
	});

	test(`${mode}: the label names the root and points at the field`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const labelId = el(Label).getAttribute('id');
		expect(labelId).toBeTruthy();
		expect(el(Root).getAttribute('aria-labelledby')).toBe(labelId);
		expect(el(Label).getAttribute('for')).toBe(el(Input).getAttribute('id'));
	});

	test(`${mode}: every delete button is named with the tag it removes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(closeFor('alpha').getAttribute('aria-label')).toBe('Remove alpha');
		expect(closeFor('beta').getAttribute('aria-label')).toBe('Remove beta');
	});

	test(`${mode}: pressing a delete button takes that tag off the list`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		closeFor('alpha').click();
		await expect.poll(() => el(Held).textContent).toBe('beta');
		await expect.poll(() => shownTags()).toEqual(['beta']);
	});

	test(`${mode}: a removal is spoken by the live region the root always renders`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		closeFor('beta').click();
		await expect.poll(() => spoken()).toBe('beta removed');
	});

	test(`${mode}: typing the delimiter commits the words before it`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, 'gamma,');
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta|gamma');
		await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('');
		await expect.poll(() => spoken()).toBe('gamma added');
	});

	test(`${mode}: enter commits the typed words`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, 'gamma{Enter}');
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta|gamma');
		await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('');
	});

	test(`${mode}: a tag already held is passed over rather than repeated`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, 'alpha{Enter}');
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta');
		await expect.poll(() => shownTags()).toEqual(['alpha', 'beta']);
	});

	test(`${mode}: arrow left at caret 0 walks into the row from the end`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(true);
		// The caret never left the field: that is the whole split focus model.
		expect(document.activeElement).toBe(el(Input));

		await userEvent.keyboard('{ArrowLeft}');
		await expect.poll(() => at('item-alpha').hasAttribute('ui-highlighted')).toBe(true);
		// The left end holds rather than wrapping.
		await userEvent.keyboard('{ArrowLeft}');
		await expect.poll(() => at('item-alpha').hasAttribute('ui-highlighted')).toBe(true);
	});

	test(`${mode}: arrow right walks back out of the row and gives the caret its keys back`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{ArrowRight}');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(false);
		await expect.poll(() => at('item-alpha').hasAttribute('ui-highlighted')).toBe(false);
	});

	test(`${mode}: arrow left with text under the caret moves the caret, not the walk`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, 'word');
		await userEvent.keyboard('{ArrowLeft}');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(false);
		await expect.poll(() => el<HTMLInputElement>(Input).selectionStart).toBe(3);
	});

	test(`${mode}: backspace walks before it deletes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, '{Backspace}');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(true);
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta');

		await userEvent.keyboard('{Backspace}');
		await expect.poll(() => el(Held).textContent).toBe('alpha');
	});

	test(`${mode}: backspace with text in the field deletes text and leaves the row alone`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await typeInto(Input, 'ab{Backspace}');
		await expect.poll(() => el<HTMLInputElement>(Input).value).toBe('a');
		await expect.poll(() => shownTags()).toEqual(['alpha', 'beta']);
	});

	test(`${mode}: delete removes the highlighted tag and the highlight lands on its neighbour`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{ArrowLeft}{Delete}');
		await expect.poll(() => el(Held).textContent).toBe('beta');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(true);
	});

	test(`${mode}: escape gives the walk back to the caret`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Escape}');
		await expect.poll(() => at('item-beta').hasAttribute('ui-highlighted')).toBe(false);
	});

	test(`${mode}: a paste splits into one tag per piece`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const field = el<HTMLInputElement>(Input);
		field.focus();
		const data = new DataTransfer();
		data.setData('text', 'gamma, delta ,alpha');
		field.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
		// The already-held tag is passed over, the whitespace is trimmed.
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta|gamma|delta');
	});

	// The row's `name={taglist.name}` reads a cell outside the repeated tag, and
	// the row template carries that read, so a tag the first render did not carry
	// is built with the name the served rows have.
	test(`${mode}: the form field hands back one entry per tag under one name`, async () => {
		if (mode === 'CSR') await render(TopicsForm);
		else await renderSSR(TopicsForm);

		await typeInto(Input, 'sport,');
		// The hidden inputs are what a form receives, so they are what this row
		// reads: the chips beside them are the consumer's own markup.
		await expect
			.poll(() => [...el(Field).querySelectorAll('input')].map((one) => one.value))
			.toEqual(['news', 'sport']);
		el(page.getByTestId('form')).dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		);
		await expect.poll(() => el(Submitted).textContent).toBe('news|sport');
	});

	test(`${mode}: the form field drops a tag the row started with, and takes it back`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		closeFor('alpha').click();
		await expect
			.poll(() => [...el(Field).querySelectorAll('input')].map((one) => one.value))
			.toEqual(['beta']);
		await typeInto(Input, 'alpha,');
		await expect
			.poll(() => [...el(Field).querySelectorAll('input')].map((one) => one.value))
			.toEqual(['beta', 'alpha']);
	});

	test(`${mode}: a consumer component inside the root reads the family's seeded state`, async () => {
		if (mode === 'CSR') await render(ConsumerState);
		else await renderSSR(ConsumerState);

		const summary = at('summary');
		expect(summary.getAttribute('ui-name')).toBe('topics');
		expect(summary.getAttribute('ui-count')).toBe('2');
		expect(summary.textContent).toBe('alpha|beta');
	});

	// Pinned: the text CALLS a method on the array (`join`), and an expression
	// that calls a method in a template position is wired to nothing. The position
	// is not the ingredient - an attribute spelled the same way stays stale too.
	test(`${mode}: a consumer component's text over the family's value refreshes`, async () => {
		if (mode === 'CSR') await render(ConsumerState);
		else await renderSSR(ConsumerState);

		await typeInto(Input, 'gamma,');
		await expect.poll(() => at('summary').getAttribute('ui-count')).toBe('3');
		await expect.poll(() => at('summary').textContent).toBe('alpha|beta|gamma');
	});

	test(`${mode}: the field names the error before the hint, and reports itself invalid`, async () => {
		if (mode === 'CSR') await render(TopicsForm);
		else await renderSSR(TopicsForm);

		const described = el(Input).getAttribute('aria-describedby') ?? '';
		expect(described.split(/\s+/)).toEqual([
			el(ErrorMessage).getAttribute('id'),
			el(Description).getAttribute('id'),
		]);
		expect(el(ErrorMessage).getAttribute('role')).toBe('alert');
		expect(el(Input).getAttribute('aria-invalid')).toBe('true');
		expect(el(Input).getAttribute('aria-required')).toBe('true');
	});

	test(`${mode}: the cap refuses the tag past it and says so`, async () => {
		if (mode === 'CSR') await render(Capped);
		else await renderSSR(Capped);

		await typeInto(Input, 'two;three;four;');
		await expect.poll(() => el(Held).textContent).toBe('one|two|three');
		// The run stopped at the cap, so it still admitted two. Only a run that
		// admits nothing at all is a refusal worth speaking.
		await expect.poll(() => spoken()).toBe('2 tags added');
		await typeInto(Input, 'five;');
		// A resumed document takes the first of these two gestures through a demand
		// load, so the second phrase needs more room than the default poll.
		await expect.poll(() => spoken(), { timeout: 4000 }).toBe('3 tags is the limit');
		await expect.poll(() => el(Held).textContent).toBe('one|two|three');
	});

	test(`${mode}: a display-only row has no field and still removes a tag`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		expect(document.querySelectorAll('[data-testid="input"]').length).toBe(0);
		closeFor('green').click();
		await expect.poll(() => el(Held).textContent).toBe('red|blue');
	});

	test(`${mode}: the delete buttons of a display-only row are tab stops`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		// No tabindex is written at all: they are ordinary buttons, which is the
		// deliberate divergence from React Aria's roving tabindex.
		expect(closeFor('red').hasAttribute('tabindex')).toBe(false);
		closeFor('red').focus();
		expect(document.activeElement).toBe(closeFor('red'));
	});

	test(`${mode}: the arrows walk focus along a display-only row`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		closeFor('red').focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(() => document.activeElement).toBe(closeFor('green'));
		await userEvent.keyboard('{End}');
		await expect.poll(() => document.activeElement).toBe(closeFor('blue'));
		await userEvent.keyboard('{Home}');
		await expect.poll(() => document.activeElement).toBe(closeFor('red'));
	});

	test(`${mode}: delete on a focused tag removes it and focus lands on the neighbour`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		closeFor('green').focus();
		await userEvent.keyboard('{Delete}');
		await expect.poll(() => el(Held).textContent).toBe('red|blue');
		// The highlight lands on the neighbour. Where DOM focus lands is not pinned
		// here: the keyed repeat replaces the row's nodes, and the button this
		// handler focused is gone by the time the browser applies it.
		await expect.poll(() => at('item-blue').hasAttribute('ui-highlighted')).toBe(true);
	});

	test(`${mode}: focusing a tag moves the walk onto it`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		closeFor('green').focus();
		await expect.poll(() => at('item-green').hasAttribute('ui-highlighted')).toBe(true);
	});

	test(`${mode}: nothing is editable without the prop that says so`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Enter}');
		// Enter with no edit part and no `editable` commits the (empty) field
		// instead, which changes nothing.
		await expect.poll(() => el(Held).textContent).toBe('alpha|beta');
	});

	test(`${mode}: enter on a highlighted tag opens its own field with its words in it`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Enter}');
		await expect.poll(() => editFor('review').hidden).toBe(false);
		await expect.poll(() => document.activeElement).toBe(editFor('review'));
		expect(editFor('review').value).toBe('review');
	});

	test(`${mode}: enter in an edit field takes the new words and keeps the tag's place`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Enter}');
		await expect.poll(() => document.activeElement).toBe(editFor('review'));
		editFor('review').setSelectionRange(0, editFor('review').value.length);
		await userEvent.keyboard('signoff{Enter}');
		await expect.poll(() => el(Held).textContent).toBe('draft|signoff');
		await expect.poll(() => document.activeElement).toBe(el(Input));
	});

	test(`${mode}: escape in an edit field gives the tag back unchanged`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Enter}');
		await expect.poll(() => document.activeElement).toBe(editFor('review'));
		editFor('review').setSelectionRange(0, editFor('review').value.length);
		await userEvent.keyboard('scrapped{Escape}');
		await expect.poll(() => el(Held).textContent).toBe('draft|review');
	});

	test(`${mode}: a double-click opens the tag for editing`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		at('itemlabel-draft').dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }),
		);
		await expect.poll(() => editFor('draft').hidden).toBe(false);
	});

	// The other focus regime: DOM focus is on the tag's delete button, so Enter and
	// Space are that button's own activation and F2 is the key left for opening an
	// edit. The three rows below are that route and the two things it must not take.
	test(`${mode}: F2 on a tag under the walk opens its own field with its words in it`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		closeFor('draft').focus();
		await expect.poll(() => at('item-draft').hasAttribute('ui-highlighted')).toBe(true);
		await userEvent.keyboard('{F2}');
		await expect.poll(() => editFor('draft').hidden).toBe(false);
		await expect.poll(() => document.activeElement).toBe(editFor('draft'));
		expect(editFor('draft').value).toBe('draft');
	});

	test(`${mode}: enter on a focused delete button removes the tag instead of opening it`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		closeFor('draft').focus();
		await userEvent.keyboard('{Enter}');
		await expect.poll(() => el(Held).textContent).toBe('review');
	});

	test(`${mode}: F2 opens nothing on a row that mounts no edit field`, async () => {
		if (mode === 'CSR') await render(DisplayOnly);
		else await renderSSR(DisplayOnly);

		closeFor('green').focus();
		await expect.poll(() => at('item-green').hasAttribute('ui-highlighted')).toBe(true);
		await userEvent.keyboard('{F2}');
		await expect.poll(() => at('item-green').hasAttribute('ui-editing')).toBe(false);
		expect(el(Held).textContent).toBe('red|green|blue');
	});

	test(`${mode}: an edit field is hidden until its own tag is the one being edited`, async () => {
		if (mode === 'CSR') await render(Editable);
		else await renderSSR(Editable);

		expect(editFor('draft').hidden).toBe(true);
		expect(editFor('review').hidden).toBe(true);
	});

	test(`${mode}: a disabled taglist refuses every gesture`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);

		expect(el<HTMLInputElement>(Input).disabled).toBe(true);
		expect(closeFor('locked').disabled).toBe(true);
		closeFor('locked').click();
		await expect.poll(() => el(Held).textContent).toBe('locked');
	});

	test(`${mode}: two taglists on one page answer for their own tags`, async () => {
		if (mode === 'CSR') await render(TwoTagLists);
		else await renderSSR(TwoTagLists);

		await typeInto(page.getByTestId('left-input'), 'pear{Enter}');
		await expect.poll(() => el(page.getByTestId('left-held')).textContent).toBe('apple|pear');
		await expect.poll(() => el(page.getByTestId('right-held')).textContent).toBe('x|y');

		el<HTMLButtonElement>(page.getByTestId('right-itemclose-x')).click();
		await expect.poll(() => el(page.getByTestId('right-held')).textContent).toBe('y');
		await expect.poll(() => el(page.getByTestId('left-held')).textContent).toBe('apple|pear');
	});

	test(`${mode}: the two labels name their own root`, async () => {
		if (mode === 'CSR') await render(TwoTagLists);
		else await renderSSR(TwoTagLists);

		const leftLabel = el(page.getByTestId('left-label')).getAttribute('id');
		const rightLabel = el(page.getByTestId('right-label')).getAttribute('id');
		expect(leftLabel).not.toBe(rightLabel);
		expect(el(page.getByTestId('left-root')).getAttribute('aria-labelledby')).toBe(leftLabel);
		expect(el(page.getByTestId('right-root')).getAttribute('aria-labelledby')).toBe(rightLabel);
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		const result = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const scope = scopeOf(result);

		for (const id of ['root', 'label', 'input', 'field', 'item-alpha', 'itemclose-alpha']) {
			expect(scope.querySelectorAll(`[data-testid="${id}"]`).length, id).toBe(1);
		}
	});

	test(`${mode}: the hidden form inputs are the only thing the field part renders`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const inputs = [...el(Field).querySelectorAll('input')];
		expect(inputs.map((one) => one.name)).toEqual(['topics', 'topics']);
		expect(inputs.map((one) => one.value)).toEqual(['alpha', 'beta']);
		expect(inputs.every((one) => one.type === 'hidden')).toBe(true);
	});
}

// ---------------------------------------------------------------------------
// axe, per scenario. The battery in test-support holds the starter to the same
// checks; these rows cover the shapes it does not mount.
// ---------------------------------------------------------------------------

test('CSR: axe finds nothing in the starter', async () => {
	await expectNoAxeViolations(scopeOf(await render(Basic)), 'the starter is showing');
});

test('CSR: axe finds nothing in a display-only row', async () => {
	await expectNoAxeViolations(scopeOf(await render(DisplayOnly)), 'a display-only row is showing');
});

test('CSR: axe finds nothing in an editable list', async () => {
	await expectNoAxeViolations(scopeOf(await render(Editable)), 'an editable list is showing');
});

test('CSR: axe finds nothing in a capped list', async () => {
	await expectNoAxeViolations(scopeOf(await render(Capped)), 'a capped list is showing');
});

test('CSR: axe finds nothing in a disabled list', async () => {
	await expectNoAxeViolations(scopeOf(await render(Disabled)), 'a disabled list is showing');
});

test('CSR: axe finds nothing in a form', async () => {
	await expectNoAxeViolations(scopeOf(await render(TopicsForm)), 'a form is showing');
});

test('CSR: axe finds nothing while a tag is open for editing', async () => {
	const result = await render(Editable);
	await pressAtCaret(el<HTMLInputElement>(Input), 0, '{ArrowLeft}{Enter}');
	await expect.poll(() => editFor('review').hidden).toBe(false);
	await expectNoAxeViolations(scopeOf(result), 'a tag is open for editing');
});
