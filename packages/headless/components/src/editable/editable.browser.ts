import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { editKey, heldText, opensEdit, previewText, settled, showsPlaceholder } from './edit-walk.ts';
import Basic from './scenarios/basic.tsrx';
import CancelOnBlur from './scenarios/cancel-on-blur.tsrx';
import DoubleClick from './scenarios/double-click.tsrx';
import Empty from './scenarios/empty.tsrx';
import Locked from './scenarios/locked.tsrx';
import OnFocus from './scenarios/on-focus.tsrx';
import RenameForm from './scenarios/rename-form.tsrx';
import TwoEditables from './scenarios/two-editables.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Trigger = page.getByTestId('trigger');
const Input = page.getByTestId('input');
const Field = page.getByTestId('field');
const Held = page.getByTestId('held');
const Sessions = page.getByTestId('sessions');
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

/** Open the session the way a pointer does, and wait for the field to be there. */
async function openSession() {
	el<HTMLButtonElement>(Trigger).click();
	await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(false);
}

/** Replace everything in the open field with `words`. */
async function retype(words: string) {
	const field = el<HTMLInputElement>(Input);
	field.setSelectionRange(0, field.value.length);
	await userEvent.keyboard(words);
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
// The session arithmetic, held on its own. There is no node lane in this
// package, so the six pure functions taglist's per-tag edit would import are
// rows here.
// ---------------------------------------------------------------------------

test('the two keys a session answers for, and nothing else', () => {
	expect(editKey('Enter')).toBe('commit');
	expect(editKey('Escape')).toBe('cancel');
	expect(editKey('Tab')).toBeUndefined();
	expect(editKey('ArrowLeft')).toBeUndefined();
	expect(editKey('a')).toBeUndefined();
});

test('a double-click family still opens from the keyboard', () => {
	// detail 0 is the click a key made: it opens under either policy.
	expect(opensEdit(0, true)).toBe(true);
	expect(opensEdit(0, false)).toBe(true);
	expect(opensEdit(1, false)).toBe(true);
	expect(opensEdit(1, true)).toBe(false);
	expect(opensEdit(2, true)).toBe(true);
	expect(opensEdit(2, false)).toBe(true);
});

test('a session takes the trimmed words, or gives the previous value back untouched', () => {
	expect(settled('old', '  new  ', true)).toBe('new');
	// The typed text is discarded unread on the cancel path.
	expect(settled('old', 'new', false)).toBe('old');
	expect(settled('old', '', true)).toBe('');
	expect(settled('old', 'old', true)).toBe('old');
});

test('the preview shows the placeholder only for an empty value', () => {
	expect(previewText('a', 'Name it')).toBe('a');
	expect(previewText('', 'Name it')).toBe('Name it');
	expect(previewText('', '')).toBe('');
	expect(showsPlaceholder('', 'Name it')).toBe(true);
	expect(showsPlaceholder('a', 'Name it')).toBe(false);
	expect(showsPlaceholder('', '')).toBe(false);
});

test('the value prop wins over the family own write, which wins over the seed', () => {
	expect(heldText('given', 'own', 'seed')).toBe('given');
	// An empty controlled value is still a controlled value.
	expect(heldText('', 'own', 'seed')).toBe('');
	expect(heldText(undefined, 'own', 'seed')).toBe('own');
	expect(heldText(undefined, null, 'seed')).toBe('seed');
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
		expect(el<HTMLButtonElement>(Trigger).tagName).toBe('BUTTON');
		expect(el<HTMLButtonElement>(Trigger).type).toBe('button');
		expect(el(Trigger).textContent).toBe('Quarterly plan');
		expect(el<HTMLInputElement>(Input).type).toBe('text');
		expect(el<HTMLInputElement>(Field).type).toBe('hidden');
	});

	test(`${mode}: the preview is showing and the field is not`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el<HTMLButtonElement>(Trigger).hidden).toBe(false);
		expect(el<HTMLInputElement>(Input).hidden).toBe(true);
		expect(el(Root).hasAttribute('ui-editing')).toBe(false);
	});

	test(`${mode}: the label names the root and points at the field`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const labelId = el(Label).getAttribute('id');
		expect(labelId).toBeTruthy();
		expect(el(Root).getAttribute('aria-labelledby')).toBe(labelId);
		expect(el(Label).getAttribute('for')).toBe(el(Input).getAttribute('id'));
	});

	test(`${mode}: a click opens the session and the caret lands in the field with the words selected`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		// No frame gap: the write commits, then the focus call lands.
		await expect.poll(() => document.activeElement).toBe(el(Input));
		expect(el<HTMLInputElement>(Input).value).toBe('Quarterly plan');
		expect(el<HTMLInputElement>(Input).selectionStart).toBe(0);
		expect(el<HTMLInputElement>(Input).selectionEnd).toBe('Quarterly plan'.length);
		expect(el<HTMLButtonElement>(Trigger).hidden).toBe(true);
		expect(el(Root).hasAttribute('ui-editing')).toBe(true);
	});

	test(`${mode}: enter takes the words and hands focus back to the preview`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		await retype('Annual plan{Enter}');
		await expect.poll(() => el(Held).textContent).toBe('Annual plan');
		await expect.poll(() => el(Trigger).textContent).toBe('Annual plan');
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(true);
		await expect.poll(() => document.activeElement).toBe(el(Trigger));
	});

	test(`${mode}: escape restores the previous value and hands focus back`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		await retype('Scrapped{Escape}');
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(true);
		await expect.poll(() => document.activeElement).toBe(el(Trigger));
		expect(el(Held).textContent).toBe('Quarterly plan');
		expect(el(Trigger).textContent).toBe('Quarterly plan');
	});

	test(`${mode}: the words are trimmed on the way in`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		await retype('   Trimmed   {Enter}');
		await expect.poll(() => el(Held).textContent).toBe('Trimmed');
	});

	test(`${mode}: a session that changed nothing reports no value`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		await userEvent.keyboard('{Enter}');
		// Both edges of the session are reported; the value callback is not.
		await expect.poll(() => el(Sessions).textContent).toBe('open shut ');
		expect(el(Held).textContent).toBe('Quarterly plan');
	});

	test(`${mode}: blur takes the words by default`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		await retype('Left alone');
		el<HTMLInputElement>(Input).blur();
		await expect.poll(() => el(Held).textContent).toBe('Left alone');
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(true);
	});

	test(`${mode}: blur does not take focus back to the preview`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openSession();
		el<HTMLInputElement>(Input).blur();
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(true);
		// The person moved focus themselves; taking it back is the classic bug.
		expect(document.activeElement).not.toBe(el(Trigger));
	});

	test(`${mode}: cancelOnBlur gives the previous value back instead`, async () => {
		if (mode === 'CSR') await render(CancelOnBlur);
		else await renderSSR(CancelOnBlur);

		await openSession();
		await retype('thrown away');
		el<HTMLInputElement>(Input).blur();
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(true);
		expect(el(Held).textContent).toBe('draft');
		expect(el(Trigger).textContent).toBe('draft');
	});

	test(`${mode}: one click does nothing under editOnDoubleClick`, async () => {
		if (mode === 'CSR') await render(DoubleClick);
		else await renderSSR(DoubleClick);

		el(Trigger).dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
		);
		await expect.poll(() => el(Root).hasAttribute('ui-editing')).toBe(false);
		expect(el<HTMLInputElement>(Input).hidden).toBe(true);
	});

	test(`${mode}: two clicks open the session under editOnDoubleClick`, async () => {
		if (mode === 'CSR') await render(DoubleClick);
		else await renderSSR(DoubleClick);

		el(Trigger).dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 }),
		);
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(false);
		await expect.poll(() => document.activeElement).toBe(el(Input));
	});

	test(`${mode}: a key still opens a double-click editable`, async () => {
		if (mode === 'CSR') await render(DoubleClick);
		else await renderSSR(DoubleClick);

		el<HTMLButtonElement>(Trigger).focus();
		await userEvent.keyboard('{Enter}');
		// The click a key makes carries detail 0, which opens under either policy:
		// a control only a mouse can reach is a WCAG 2.1.1 failure.
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(false);
	});

	test(`${mode}: focusing the preview opens the session under editOnFocus`, async () => {
		if (mode === 'CSR') await render(OnFocus);
		else await renderSSR(OnFocus);

		el<HTMLButtonElement>(Trigger).focus();
		await expect.poll(() => el<HTMLInputElement>(Input).hidden).toBe(false);
		await expect.poll(() => document.activeElement).toBe(el(Input));
	});

	test(`${mode}: focus alone does not open a plain editable`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		el<HTMLButtonElement>(Trigger).focus();
		await expect.poll(() => el(Root).hasAttribute('ui-editing')).toBe(false);
	});

	test(`${mode}: an empty value shows the placeholder, and the preview is named by it`, async () => {
		if (mode === 'CSR') await render(Empty);
		else await renderSSR(Empty);

		expect(el(Trigger).textContent).toBe('Name this list');
		expect(el(Trigger).hasAttribute('ui-empty')).toBe(true);
		expect(el<HTMLInputElement>(Input).placeholder).toBe('Name this list');
		expect(el<HTMLInputElement>(Field).value).toBe('');
	});

	test(`${mode}: an uncontrolled editable keeps the words it was given`, async () => {
		if (mode === 'CSR') await render(Empty);
		else await renderSSR(Empty);

		await openSession();
		await retype('Reading list{Enter}');
		await expect.poll(() => el(Trigger).textContent).toBe('Reading list');
		await expect.poll(() => el(Trigger).hasAttribute('ui-empty')).toBe(false);
		expect(el<HTMLInputElement>(Field).value).toBe('Reading list');
	});

	test(`${mode}: a disabled editable refuses every gesture`, async () => {
		if (mode === 'CSR') await render(Locked);
		else await renderSSR(Locked);

		expect(at('off-trigger').hasAttribute('disabled')).toBe(true);
		expect((at('off-input') as HTMLInputElement).disabled).toBe(true);
		at('off-trigger').dispatchEvent(
			new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
		);
		await expect.poll(() => at('off-root').hasAttribute('ui-editing')).toBe(false);
		expect(at('off-root').getAttribute('aria-disabled')).toBe('true');
	});

	test(`${mode}: a read-only editable stays reachable and never opens`, async () => {
		if (mode === 'CSR') await render(Locked);
		else await renderSSR(Locked);

		const trigger = at('ro-trigger') as HTMLButtonElement;
		// Focusable and readable: a read-only value is still a value somebody has
		// to be able to hear.
		expect(trigger.hasAttribute('disabled')).toBe(false);
		expect(trigger.getAttribute('aria-disabled')).toBe('true');
		expect(trigger.textContent).toBe('published');
		trigger.focus();
		expect(document.activeElement).toBe(trigger);
		trigger.click();
		await expect.poll(() => at('ro-root').hasAttribute('ui-editing')).toBe(false);
	});

	test(`${mode}: the field and the preview both name the error before the hint`, async () => {
		if (mode === 'CSR') await render(RenameForm);
		else await renderSSR(RenameForm);

		const expected = [
			el(ErrorMessage).getAttribute('id'),
			el(Description).getAttribute('id'),
		];
		expect((el(Input).getAttribute('aria-describedby') ?? '').split(/\s+/)).toEqual(expected);
		expect((el(Trigger).getAttribute('aria-describedby') ?? '').split(/\s+/)).toEqual(expected);
		expect(el(ErrorMessage).getAttribute('role')).toBe('alert');
		expect(el(Input).getAttribute('aria-invalid')).toBe('true');
		expect(el(Input).getAttribute('aria-required')).toBe('true');
	});

	test(`${mode}: the form receives the value under the root's name`, async () => {
		if (mode === 'CSR') await render(RenameForm);
		else await renderSSR(RenameForm);

		expect(el<HTMLInputElement>(Field).name).toBe('title');
		expect(el<HTMLInputElement>(Field).value).toBe('Untitled');
		el(page.getByTestId('form')).dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		);
		await expect.poll(() => el(Submitted).textContent).toBe('Untitled');
	});

	test(`${mode}: a committed rename reaches the form`, async () => {
		if (mode === 'CSR') await render(RenameForm);
		else await renderSSR(RenameForm);

		await openSession();
		await retype('Q3 numbers{Enter}');
		await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('Q3 numbers');
		el(page.getByTestId('form')).dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		);
		await expect.poll(() => el(Submitted).textContent).toBe('Q3 numbers');
	});

	test(`${mode}: two editables on one page answer for their own value`, async () => {
		if (mode === 'CSR') await render(TwoEditables);
		else await renderSSR(TwoEditables);

		el<HTMLButtonElement>(page.getByTestId('left-trigger')).click();
		await expect.poll(() => (at('left-input') as HTMLInputElement).hidden).toBe(false);
		// The other one never opened.
		expect((at('right-input') as HTMLInputElement).hidden).toBe(true);

		const field = at('left-input') as HTMLInputElement;
		field.setSelectionRange(0, field.value.length);
		await userEvent.keyboard('gamma{Enter}');
		await expect.poll(() => at('left-held').textContent).toBe('gamma');
		expect(at('right-held').textContent).toBe('beta');
		expect(at('right-trigger').textContent).toBe('beta');
	});

	test(`${mode}: the two labels name their own root`, async () => {
		if (mode === 'CSR') await render(TwoEditables);
		else await renderSSR(TwoEditables);

		const leftLabel = at('left-label').getAttribute('id');
		const rightLabel = at('right-label').getAttribute('id');
		expect(leftLabel).not.toBe(rightLabel);
		expect(at('left-root').getAttribute('aria-labelledby')).toBe(leftLabel);
		expect(at('right-root').getAttribute('aria-labelledby')).toBe(rightLabel);
	});

	test(`${mode}: every part renders exactly one element`, async () => {
		const result = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		const scope = scopeOf(result);

		for (const id of ['root', 'label', 'trigger', 'input', 'field']) {
			expect(scope.querySelectorAll(`[data-testid="${id}"]`).length, id).toBe(1);
		}
	});
}

// ---------------------------------------------------------------------------
// axe, per scenario. The battery in test-support holds the starter to the same
// checks; these rows cover the shapes it does not mount.
// ---------------------------------------------------------------------------

test('CSR: axe finds nothing in the starter', async () => {
	await expectNoAxeViolations(scopeOf(await render(Basic)), 'the starter is showing');
});

test('CSR: axe finds nothing while a session is open', async () => {
	const result = await render(Basic);
	await openSession();
	await expectNoAxeViolations(scopeOf(result), 'a session is open');
});

test('CSR: axe finds nothing in an empty editable', async () => {
	await expectNoAxeViolations(scopeOf(await render(Empty)), 'an empty editable is showing');
});

test('CSR: axe finds nothing in a locked pair', async () => {
	await expectNoAxeViolations(scopeOf(await render(Locked)), 'a locked pair is showing');
});

test('CSR: axe finds nothing in a form', async () => {
	await expectNoAxeViolations(scopeOf(await render(RenameForm)), 'a form is showing');
});

test('CSR: axe finds nothing with two on a page', async () => {
	await expectNoAxeViolations(scopeOf(await render(TwoEditables)), 'two are showing');
});
