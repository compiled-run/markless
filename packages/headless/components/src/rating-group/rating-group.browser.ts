import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { Basic } from './scenarios/basic.tsrx';
import { Disabled } from './scenarios/disabled.tsrx';
import { FeedbackForm } from './scenarios/feedback-form.tsrx';
import { HalfStars } from './scenarios/half-stars.tsrx';
import { Prefilled } from './scenarios/prefilled.tsrx';
import { ReadOnly } from './scenarios/read-only.tsrx';
import { TwoGroups } from './scenarios/two-groups.tsrx';
import { WithHelp } from './scenarios/with-help.tsrx';
import { WithOnChange } from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Description = page.getByTestId('description');
const ValueLabel = page.getByTestId('valuelabel');
const Field = page.getByTestId('field');
const Submitted = page.getByTestId('submitted');
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so each test must branch
// on the mode rather than take the mount by reference.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent on
// purpose rather than by suppression: this family ships unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function marks(testid = 'star'): HTMLElement[] {
	return page.getByTestId(testid).elements() as HTMLElement[];
}

function attributes(name: string, testid = 'star') {
	return marks(testid).map((mark) => mark.getAttribute(name));
}

function flags(name: string, testid = 'star') {
	return marks(testid).map((mark) => mark.hasAttribute(name));
}

function fillOf(mark: Element) {
	return window.getComputedStyle(mark).getPropertyValue('--rating-fill').trim();
}

/** A point inside one mark, given as a share of its width. */
function inMark(mark: HTMLElement, share: number) {
	const box = mark.getBoundingClientRect();
	return box.left + box.width * share;
}

function pointerOver(mark: HTMLElement, share: number) {
	mark.dispatchEvent(
		new PointerEvent('pointermove', {
			bubbles: true,
			clientX: inMark(mark, share),
			clientY: mark.getBoundingClientRect().top + 1,
			pointerId: 1,
			isPrimary: true,
		}),
	);
}

function pressMark(mark: HTMLElement, share: number) {
	mark.dispatchEvent(
		new MouseEvent('click', {
			bubbles: true,
			button: 0,
			detail: 1,
			clientX: inMark(mark, share),
			clientY: mark.getBoundingClientRect().top + 1,
		}),
	);
}

function leaveGroup(root: Element) {
	root.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false, pointerId: 1 }));
}

// A real submit would navigate the test iframe, so the event is dispatched instead.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
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

// ------------------------------------------------------------------ rendering

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('radiogroup');
	// The label names the group by IDREF, and the id it points at is on the page.
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).not.toBe('');
	expect(el(Root).hasAttribute('aria-disabled')).toBe(false);
	expect(el(Root).hasAttribute('aria-readonly')).toBe(false);
	expect(el(Root).getAttribute('ui-count')).toBe('5');
	expect(el(Root).getAttribute('ui-value')).toBe('0');

	// The root owns the list: five marks came from `count`, not from five hand-written parts.
	expect(marks().length).toBe(5);
	expect(page.getByRole('radio').elements().length).toBe(5);
	expect(attributes('aria-posinset')).toEqual(['1', '2', '3', '4', '5']);
	expect(attributes('aria-setsize')).toEqual(['5', '5', '5', '5', '5']);
	expect(attributes('ui-value')).toEqual(['1', '2', '3', '4', '5']);
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'false', 'false', 'false']);
	expect(flags('ui-filled')).toEqual([false, false, false, false, false]);
	expect(el(ValueLabel).textContent).toBe('0 of 5');
}

// Nothing is rated, so a reader still hears each mark by a name of its own.
function expectMarksAreNamed() {
	expect(attributes('aria-label')).toEqual(['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']);
}

// The fill is cumulative: every mark up to the rating, not one checked member.
function expectPrefilledRendered() {
	expect(flags('ui-filled')).toEqual([true, true, true, false, false]);
	expect(flags('ui-half')).toEqual([false, false, false, false, false]);
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'true', 'false', 'false']);
	expect(el(ValueLabel).textContent).toBe('3 of 5');
	expect(el(Root).getAttribute('ui-value')).toBe('3');
	expect(el(Root).getAttribute('aria-describedby')).toContain(el(Description).id);
	expect(marks().map(fillOf)).toEqual(['100%', '100%', '100%', '0%', '0%']);
}

function expectHalfRendered() {
	expect(flags('ui-filled')).toEqual([true, true, false, false, false]);
	expect(flags('ui-half')).toEqual([false, false, true, false, false]);
	// The half mark is the one a person is standing on, so it is the checked radio.
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'true', 'false', 'false']);
	expect(marks().map(fillOf)).toEqual(['100%', '100%', '50%', '0%', '0%']);
	expect(el(ValueLabel).textContent).toBe('2.5 of 5');
}

// A display-only aggregate is still a rating a reader can read.
function expectReadOnlyRendered() {
	expect(el(Root).getAttribute('role')).toBe('radiogroup');
	expect(el(Root).getAttribute('aria-readonly')).toBe('true');
	expect(el(Root).getAttribute('ui-readonly')).toBe('');
	expect(el(Root).hasAttribute('aria-disabled')).toBe(false);
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'false', 'false', 'true']);
	expect(flags('ui-half')).toEqual([false, false, false, false, true]);
	expect(el(ValueLabel).textContent).toBe('4.5 of 5');
	// Readable does not mean unreachable: the group keeps its tab stop.
	expect(attributes('tabindex')).toEqual(['-1', '-1', '-1', '-1', '0']);
}

function expectDisabledRendered() {
	expect(el(Root).getAttribute('aria-disabled')).toBe('true');
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(attributes('aria-disabled')).toEqual(['true', 'true', 'true', 'true', 'true']);
	// Nothing here is reachable, which is the one thing `disabled` does that `readonly` does not.
	expect(attributes('tabindex')).toEqual(['-1', '-1', '-1', '-1', '-1']);
}

// One tab stop, derived from the rating rather than from construction order.
function expectOneTabStop() {
	expect(attributes('tabindex')).toEqual(['0', '-1', '-1', '-1', '-1']);
}

function expectRatedMarkOwnsTheTabStop() {
	expect(attributes('tabindex')).toEqual(['-1', '-1', '0', '-1', '-1']);
}

function expectHelpRendered() {
	const after = el(page.getByTestId('after-root'));
	const describedBy = after.getAttribute('aria-describedby') ?? '';
	expect(describedBy).toContain(el(page.getByTestId('after-error')).id);
	expect(describedBy).toContain(el(page.getByTestId('after-description')).id);
	// Error first, wherever the parts sit in the page.
	expect(describedBy.indexOf(el(page.getByTestId('after-error')).id)).toBe(0);

	const before = el(page.getByTestId('before-root'));
	expect(before.getAttribute('aria-describedby')).toBe(
		el(page.getByTestId('before-error')).id,
	);
}

function expectTwoGroupsRendered() {
	expect(marks('left-star').length).toBe(5);
	expect(marks('right-star').length).toBe(10);
	expect(el(page.getByTestId('right-root')).getAttribute('ui-value')).toBe('7');
	expect(el(page.getByTestId('left-root')).getAttribute('ui-value')).toBe('0');
}

function expectFieldRendered() {
	const field = el<HTMLInputElement>(Field);
	expect(field.getAttribute('name')).toBe('score');
	expect(field.getAttribute('aria-hidden')).toBe('true');
	expect(field.tabIndex).toBe(-1);
	// The marks are role="radio" divs, so `required` is announced on the group rather than enforced by a control.
	expect(el(Root).getAttribute('aria-required')).toBe('true');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named group of five unrated marks`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: every mark carries a name of its own`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectMarksAreNamed();
	});

	test(`${mode}: a rating fills every mark up to it`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: a half rating half fills the mark it reaches`, async () => {
		if (mode === 'CSR') await render(HalfStars);
		else await renderSSR(HalfStars);
		expectHalfRendered();
	});

	test(`${mode}: a read-only group is a rating a reader can still read`, async () => {
		if (mode === 'CSR') await render(ReadOnly);
		else await renderSSR(ReadOnly);
		expectReadOnlyRendered();
	});

	test(`${mode}: a disabled group leaves the tab order`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: an unrated group puts its single tab stop on the first mark`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectOneTabStop();
	});

	test(`${mode}: a rated group puts its single tab stop on the mark the rating reaches`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectRatedMarkOwnsTheTabStop();
	});

	test(`${mode}: help and validation text describe the group, error first`, async () => {
		if (mode === 'CSR') await render(WithHelp);
		else await renderSSR(WithHelp);
		expectHelpRendered();
	});

	test(`${mode}: two groups on a page each render their own count`, async () => {
		if (mode === 'CSR') await render(TwoGroups);
		else await renderSSR(TwoGroups);
		expectTwoGroupsRendered();
	});

	test(`${mode}: the form field takes the group's name and stays out of the way`, async () => {
		if (mode === 'CSR') await render(FeedbackForm);
		else await renderSSR(FeedbackForm);
		expectFieldRendered();
	});

	test(`${mode}: the starter reports no axe violations`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(mounted), `${mode} with nothing rated`);
	});

	test(`${mode}: a read-only aggregate reports no axe violations`, async () => {
		const mounted = mode === 'CSR' ? await render(ReadOnly) : await renderSSR(ReadOnly);
		await expectNoAxeViolations(scopeOf(mounted), `${mode} read-only`);
	});
}

// -------------------------------------------------------------------- pointer

test('CSR: pressing a mark rates it', async () => {
	await render(Basic);
	pressMark(marks()[3], 0.75);

	await expect.poll(() => el(ValueLabel).textContent).toBe('4 of 5');
	await expect.poll(() => flags('ui-filled')).toEqual([true, true, true, true, false]);
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'false', 'true', 'false']);
});

test('CSR: pressing the near half of a mark rates it half', async () => {
	await render(HalfStars);
	pressMark(marks()[3], 0.25);

	await expect.poll(() => el(ValueLabel).textContent).toBe('3.5 of 5');
	await expect.poll(() => flags('ui-half')).toEqual([false, false, false, true, false]);

	pressMark(marks()[3], 0.75);
	await expect.poll(() => el(ValueLabel).textContent).toBe('4 of 5');
});

// The transient half of the family: a hover offers a rating nobody has committed.
test('CSR: hovering a mark previews it without committing anything', async () => {
	await render(Prefilled);
	pointerOver(marks()[4], 0.75);

	await expect.poll(() => flags('ui-filled')).toEqual([true, true, true, true, true]);
	// The committed rating never moved: the readout and `aria-checked` still say three.
	expect(el(ValueLabel).textContent).toBe('3 of 5');
	expect(attributes('aria-checked')).toEqual(['false', 'false', 'true', 'false', 'false']);
	expect(flags('ui-preview')).toEqual([true, true, true, true, true]);

	leaveGroup(el(Root));
	await expect.poll(() => flags('ui-filled')).toEqual([true, true, true, false, false]);
	expect(flags('ui-preview')).toEqual([false, false, false, false, false]);
});

test('CSR: a hover over the near half of a mark previews the half value', async () => {
	await render(HalfStars);
	pointerOver(marks()[4], 0.25);

	await expect.poll(() => flags('ui-half')).toEqual([false, false, false, false, true]);
	expect(el(ValueLabel).textContent).toBe('2.5 of 5');
});

// ------------------------------------------------------------------- keyboard

test('CSR: an arrow moves the rating and takes focus with it', async () => {
	await render(Prefilled);
	marks()[2].focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('4 of 5');
	await expect.poll(() => document.activeElement).toBe(marks()[3]);

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('3 of 5');
	await expect.poll(() => document.activeElement).toBe(marks()[2]);
});

// A rating has a way back to nothing, which a radio group does not.
test('CSR: Home clears the rating and End fills every mark', async () => {
	await render(Prefilled);
	marks()[2].focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('5 of 5');
	await expect.poll(() => document.activeElement).toBe(marks()[4]);

	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('0 of 5');
	await expect.poll(() => flags('ui-filled')).toEqual([false, false, false, false, false]);
	await expect.poll(() => document.activeElement).toBe(marks()[0]);
});

test('CSR: an arrow steps by a half when the group takes halves', async () => {
	await render(HalfStars);
	marks()[2].focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('3 of 5');
	// A half step leaves focus on the mark it half fills, so 3 → 2.5 moves focus once, not twice.
	await expect.poll(() => document.activeElement).toBe(marks()[2]);

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('2.5 of 5');
});

test('CSR: Space rates the focused mark whole', async () => {
	await render(HalfStars);
	marks()[4].focus();

	await userEvent.keyboard(' ');
	await expect.poll(() => el(ValueLabel).textContent).toBe('5 of 5');
});

test('CSR: the rating stops at both ends', async () => {
	await render(Basic);
	marks()[0].focus();

	await userEvent.keyboard('{ArrowLeft}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(ValueLabel).textContent).toBe('0 of 5');

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(ValueLabel).textContent).toBe('5 of 5');
	await userEvent.keyboard('{ArrowRight}');
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(ValueLabel).textContent).toBe('5 of 5');
});

// ------------------------------------------------------------------ locked out

test('CSR: a read-only group ignores a press and a key', async () => {
	await render(ReadOnly);
	pressMark(marks()[0], 0.75);
	marks()[4].focus();
	await userEvent.keyboard('{ArrowLeft}');

	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(ValueLabel).textContent).toBe('4.5 of 5');
});

test('CSR: a read-only group offers no hover preview', async () => {
	await render(ReadOnly);
	pointerOver(marks()[0], 0.75);

	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(flags('ui-preview')).toEqual([false, false, false, false, false]);
});

test('CSR: a disabled group ignores a press', async () => {
	await render(Disabled);
	pressMark(marks()[4], 0.75);

	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(flags('ui-filled')).toEqual([true, true, false, false, false]);
});

// ---------------------------------------------------------------- consumer API

test('CSR: the consumer onChange is called once with the new rating', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');

	pressMark(marks()[3], 0.75);
	await expect.poll(() => el(Value).textContent).toBe('4');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// Controlled: the marks fill because the number came back in.
	await expect.poll(() => flags('ui-filled')).toEqual([true, true, true, true, false]);

	// Rating what is already rated is not a change, so nothing is announced.
	pressMark(marks()[3], 0.75);
	await new Promise((resolve) => setTimeout(resolve, 150));
	expect(el(Calls).textContent).toBe('1');
});

test('CSR: only the rating appears in what the form submits', async () => {
	await render(FeedbackForm);
	await expect.poll(() => submit().textContent).toBe('{"score":"0"}');

	pressMark(marks()[2], 0.75);
	await expect.poll(() => submit().textContent).toBe('{"score":"3"}');
});

test('CSR: rating one group leaves the other alone', async () => {
	await render(TwoGroups);
	pressMark(marks('left-star')[1], 0.75);

	await expect.poll(() => flags('ui-filled', 'left-star')).toEqual([
		true,
		true,
		false,
		false,
		false,
	]);
	expect(el(page.getByTestId('right-root')).getAttribute('ui-value')).toBe('7');
});
