import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import BookingForm from './scenarios/booking-form.tsrx';
import Bounded from './scenarios/bounded.tsrx';
import DayMonthYear from './scenarios/day-month-year.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Invalid from './scenarios/invalid.tsrx';
import LeadingZero from './scenarios/leading-zero.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import WithHelp from './scenarios/with-help.tsrx';
import WithHelpAndError from './scenarios/with-help-and-error.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Month = page.getByTestId('monthinput');
const Day = page.getByTestId('dayinput');
const Year = page.getByTestId('yearinput');
const Field = page.getByTestId('field');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Submitted = page.getByTestId('submitted');
const FirstValue = page.getByTestId('first-value');
const LockedValue = page.getByTestId('locked-value');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// A box draws its own digits, so what it shows is its text.
const shown = (locator: { element(): Element | null }) => el(locator).textContent;

// A real submit would navigate the test iframe, so the event is dispatched.
function submit() {
	el(page.getByTestId('form')).dispatchEvent(
		new Event('submit', { bubbles: true, cancelable: true }),
	);
	return el(Submitted);
}

async function typeInto(locator: { element(): Element | null }, keys: string) {
	el(locator).focus();
	await userEvent.keyboard(keys);
}

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('group');
	// The label names the group by IDREF, and the id it points at is on the page.
	expect(el(Root).localName).toBe('div');
	expect(el(Label).localName).toBe('label');
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).not.toBe('');
	expect(el(Root).getAttribute('aria-disabled')).toBe('false');
	expect(el(Root).getAttribute('ui-empty')).toBe('');

	for (const box of [Month, Day, Year]) {
		expect(el(box).getAttribute('role')).toBe('spinbutton');
		expect(el(box).getAttribute('tabindex')).toBe('0');
		expect(el(box).hasAttribute('aria-valuenow')).toBe(false);
		expect(el(box).getAttribute('ui-placeholder')).toBe('');
		expect(el(box).getAttribute('ui-value')).toBe('');
		// Neither message part is placed, so both handles drop out and no empty
		// attribute is left behind.
		expect(el(box).hasAttribute('aria-describedby')).toBe(false);
	}

	expect(el(Month).getAttribute('aria-label')).toBe('month input');
	expect(el(Day).getAttribute('aria-label')).toBe('day input');
	expect(el(Year).getAttribute('aria-label')).toBe('year input');
	// An empty box shows its placeholder as its own text.
	expect(shown(Month)).toBe('mm');
	expect(shown(Day)).toBe('dd');
	expect(shown(Year)).toBe('yyyy');
}

// QDS's bounds, copied: a day runs to 31 until a month and a year narrow it, a
// month to 12, and a year to 10000.
function expectBoundsRendered() {
	expect(el(Month).getAttribute('aria-valuemin')).toBe('1');
	expect(el(Month).getAttribute('aria-valuemax')).toBe('12');
	expect(el(Day).getAttribute('aria-valuemin')).toBe('1');
	expect(el(Day).getAttribute('aria-valuemax')).toBe('31');
	expect(el(Year).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Year).getAttribute('aria-valuemax')).toBe('10000');
}

function expectPrefilledRendered() {
	expect(shown(Month)).toBe('3');
	expect(shown(Day)).toBe('30');
	expect(shown(Year)).toBe('2024');
	expect(el(Month).getAttribute('aria-valuenow')).toBe('3');
	expect(el(Day).getAttribute('aria-valuenow')).toBe('30');
	expect(el(Year).getAttribute('aria-valuenow')).toBe('2024');
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);
	// March has 31 days, so the day's ceiling is the month's own length.
	expect(el(Day).getAttribute('aria-valuemax')).toBe('31');
	expect(el<HTMLInputElement>(Field).value).toBe('2024-03-30');
	expect(el(Field).getAttribute('name')).toBe('starts');
	expect(el(Field).getAttribute('aria-hidden')).toBe('true');
	expect(el(Field).getAttribute('tabindex')).toBe('-1');
	expect(getComputedStyle(el(Field).parentElement as Element).position).toBe('absolute');
}

function expectDisabledRendered() {
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(Root).getAttribute('aria-disabled')).toBe('true');
	for (const box of [Month, Day, Year]) {
		expect(el(box).getAttribute('aria-disabled')).toBe('true');
		expect(el(box).getAttribute('tabindex')).toBe('-1');
		expect(el(box).getAttribute('ui-disabled')).toBe('');
	}
	expect(el<HTMLInputElement>(Field).disabled).toBe(true);
}

function expectInvalidRendered() {
	const boxes = ['after-monthinput', 'after-dayinput', 'after-yearinput'];
	for (const testid of boxes) {
		expect(el(page.getByTestId(testid)).getAttribute('aria-invalid')).toBe('true');
	}
	// A group carries no aria-invalid of its own, so the message is named from the
	// boxes: they are the controls the state belongs to.
	const error = el(page.getByTestId('after-error'));
	expect(error.id).toBeTruthy();
	for (const testid of boxes) {
		// Only the error was placed, so the description drops out of the list and
		// the error is named alone - no stray space, no dangling id.
		expect(el(page.getByTestId(testid)).getAttribute('aria-describedby')).toBe(error.id);
	}
	// The same error written BEFORE the boxes: seeding completes before any part
	// renders, so document order does not decide what a part reads.
	expect(el(page.getByTestId('before-monthinput')).getAttribute('aria-invalid')).toBe('true');
}

function expectHelpRendered() {
	expect(el(Description).textContent?.trim()).toBe('(Month, day, then year)');
	expect(el(Description).id).toBeTruthy();
	for (const box of [Month, Day, Year]) {
		// Only the description was placed, so the error drops out of the list.
		expect(el(box).getAttribute('aria-describedby')).toBe(el(Description).id);
		expect(el(box).getAttribute('aria-invalid')).toBe('false');
	}
}

function expectBothMessagesRendered() {
	const description = el(Description);
	const error = el(ErrorMessage);
	expect(description.id).toBeTruthy();
	expect(error.id).toBeTruthy();
	expect(description.id).not.toBe(error.id);
	for (const box of [Month, Day, Year]) {
		// Both ids, error first: the hint is written above the error in this page,
		// so the order is the family's rather than the document's.
		expect(el(box).getAttribute('aria-describedby')).toBe(`${error.id} ${description.id}`);
		expect(el(box).getAttribute('aria-invalid')).toBe('true');
	}
}

function expectLeadingZeroRendered() {
	expect(shown(Month)).toBe('04');
	expect(shown(Day)).toBe('05');
	// A year is never padded, whatever the other boxes do.
	expect(shown(Year)).toBe('2024');
	expect(el(Month).getAttribute('aria-valuenow')).toBe('4');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a group of three empty boxes`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
		expectBoundsRendered();
	});

	test(`${mode}: a seeded date fills the three boxes and the hidden field`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: a date nobody may change renders its flags on every part`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: a mounted error marks every box invalid`, async () => {
		if (mode === 'CSR') await render(Invalid);
		else await renderSSR(Invalid);
		expectInvalidRendered();
	});

	test(`${mode}: help text describes the group and leaves it valid`, async () => {
		if (mode === 'CSR') await render(WithHelp);
		else await renderSSR(WithHelp);
		expectHelpRendered();
	});

	test(`${mode}: both messages are named by every box, error first`, async () => {
		if (mode === 'CSR') await render(WithHelpAndError);
		else await renderSSR(WithHelpAndError);
		expectBothMessagesRendered();
	});

	test(`${mode}: showLeadingZero pads the day and month and never the year`, async () => {
		if (mode === 'CSR') await render(LeadingZero);
		else await renderSSR(LeadingZero);
		expectLeadingZeroRendered();
	});

	test(`${mode}: the boxes read in the order they are written`, async () => {
		if (mode === 'CSR') await render(DayMonthYear);
		else await renderSSR(DayMonthYear);
		const boxes = [...el(Root).querySelectorAll('[role="spinbutton"]')];
		expect(boxes.map((box) => box.getAttribute('ui-type'))).toEqual(['day', 'month', 'year']);
	});

	test(`${mode}: the hidden field submits the whole date under its name`, async () => {
		if (mode === 'CSR') await render(BookingForm);
		else await renderSSR(BookingForm);
		expect(el(Field).getAttribute('required')).toBe('');
		await expect.poll(() => submit().textContent).toBe('{"arrival":"2024-03-30"}');
	});
}

test('CSR: typing a digit fills a box and moves on once it can hold no more', async () => {
	await render(Basic);

	await typeInto(Month, '4');
	await expect.poll(() => shown(Month)).toBe('4');
	// A month showing 4 is full at one digit: a second could only overflow.
	await expect.poll(() => document.activeElement).toBe(el(Day));

	await userEvent.keyboard('1');
	await expect.poll(() => shown(Day)).toBe('1');
	expect(document.activeElement).toBe(el(Day));

	await userEvent.keyboard('5');
	await expect.poll(() => shown(Day)).toBe('15');
	await expect.poll(() => document.activeElement).toBe(el(Year));
});

test('CSR: a month already showing 1 refuses a digit that would overflow it', async () => {
	await render(Basic);

	await typeInto(Month, '1');
	await expect.poll(() => shown(Month)).toBe('1');
	// 13 through 19 are not months, so the digit replaces rather than appends.
	await userEvent.keyboard('3');
	await expect.poll(() => shown(Month)).toBe('3');
});

test('CSR: a month already showing 1 accepts a digit that keeps it in range', async () => {
	await render(Basic);

	await typeInto(Month, '1');
	await userEvent.keyboard('2');
	await expect.poll(() => shown(Month)).toBe('12');
});

test('CSR: a day already showing 3 refuses a digit past the end of any month', async () => {
	await render(Basic);

	await typeInto(Day, '3');
	await expect.poll(() => shown(Day)).toBe('3');
	await userEvent.keyboard('2');
	await expect.poll(() => shown(Day)).toBe('2');
});

test('CSR: a day already showing 3 accepts the digits that keep it in range', async () => {
	await render(Basic);

	await typeInto(Day, '3');
	await userEvent.keyboard('1');
	await expect.poll(() => shown(Day)).toBe('31');
});

test('CSR: a lone zero stays as typed until the digit after it arrives', async () => {
	await render(Basic);

	await typeInto(Day, '0');
	await expect.poll(() => shown(Day)).toBe('0');
	expect(el(Day).hasAttribute('aria-valuenow')).toBe(true);

	await userEvent.keyboard('5');
	await expect.poll(() => shown(Day)).toBe('5');
});

test('CSR: a full year box takes the next digit as a fresh start', async () => {
	await render(Basic);

	await typeInto(Year, '2024');
	await expect.poll(() => shown(Year)).toBe('2024');
	await userEvent.keyboard('9');
	await expect.poll(() => shown(Year)).toBe('9');
});

// The keydown guard is written over event fields alone so the compiler can hoist
// it; this is the row that proves nothing else reaches the element's own text.
test('CSR: a letter, a space and a symbol never reach a box', async () => {
	await render(Basic);

	await typeInto(Month, 'a');
	await userEvent.keyboard(' ');
	await userEvent.keyboard('-');
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => shown(Month)).toBe('mm');
	expect(el(Month).hasAttribute('aria-valuenow')).toBe(false);
});

test('CSR: an arrow steps a box and wraps it at its own bounds', async () => {
	await render(Prefilled);

	await typeInto(Month, '{ArrowUp}');
	await expect.poll(() => shown(Month)).toBe('4');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => shown(Month)).toBe('3');

	await typeInto(Month, '{End}');
	await expect.poll(() => shown(Month)).toBe('12');
	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => shown(Month)).toBe('1');
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => shown(Month)).toBe('12');
});

test('CSR: an arrow on an empty box starts from today', async () => {
	await render(Basic);
	const thisMonth = `${new Date().getMonth() + 1}`;

	await typeInto(Month, '{ArrowUp}');
	await expect.poll(() => shown(Month)).toBe(thisMonth);
});

test('CSR: the page keys move a box further than an arrow does', async () => {
	await render(Prefilled);

	await typeInto(Day, '{PageDown}');
	await expect.poll(() => shown(Day)).toBe('23');
	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => shown(Day)).toBe('30');

	await typeInto(Year, '{PageUp}');
	await expect.poll(() => shown(Year)).toBe('2029');
	await userEvent.keyboard('{PageDown}');
	await expect.poll(() => shown(Year)).toBe('2024');
});

test('CSR: Home and End reach a box\'s own bounds', async () => {
	await render(Prefilled);

	await typeInto(Day, '{Home}');
	await expect.poll(() => shown(Day)).toBe('1');
	await userEvent.keyboard('{End}');
	// March has 31 days, so End on the day box lands on the month's own length.
	await expect.poll(() => shown(Day)).toBe('31');

	await typeInto(Month, '{Home}');
	await expect.poll(() => shown(Month)).toBe('1');
});

test('CSR: left and right walk the boxes in the order they are written', async () => {
	await render(DayMonthYear);

	el(Day).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Month));
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Year));
	await userEvent.keyboard('{ArrowRight}');
	expect(document.activeElement).toBe(el(Year));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Month));
});

test('CSR: backspace erases a digit and then walks back a box', async () => {
	await render(Prefilled);

	await typeInto(Day, '{Backspace}');
	await expect.poll(() => shown(Day)).toBe('3');
	expect(document.activeElement).toBe(el(Day));

	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => shown(Day)).toBe('dd');
	expect(document.activeElement).toBe(el(Day));

	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => document.activeElement).toBe(el(Month));
	expect(shown(Month)).toBe('3');
});

test('CSR: clearing one box empties the date without touching the others', async () => {
	await render(Prefilled);

	await typeInto(Day, '{Delete}');
	await expect.poll(() => shown(Day)).toBe('dd');
	expect(el(Day).hasAttribute('aria-valuenow')).toBe(false);
	expect(shown(Month)).toBe('3');
	expect(shown(Year)).toBe('2024');
	expect(el<HTMLInputElement>(Field).value).toBe('');
});

// The one piece of real logic in QDS's segment file, copied: the day's ceiling is
// live, and a day the new month does not have drops to the last one it does.
test('CSR: a day the chosen month does not have drops to its last', async () => {
	await render(Prefilled);

	await typeInto(Month, '2');
	await expect.poll(() => shown(Month)).toBe('2');
	await expect.poll(() => shown(Day)).toBe('29');
	expect(el(Day).getAttribute('aria-valuemax')).toBe('29');
	expect(el<HTMLInputElement>(Field).value).toBe('2024-02-29');
});

test('CSR: a date stepped past a bound is pulled back to it', async () => {
	await render(Bounded);

	await typeInto(Day, '{Home}');
	// The 1st is before the 10th, so the whole date settles on the bound.
	await expect.poll(() => shown(Day)).toBe('10');
	expect(shown(Month)).toBe('3');
	expect(shown(Year)).toBe('2024');

	await typeInto(Day, '{End}');
	await expect.poll(() => shown(Day)).toBe('20');
});

test('CSR: a bound holds a stepped month back too', async () => {
	await render(Bounded);

	await typeInto(Month, '{ArrowUp}');
	// April is past the 20 March ceiling, so the date lands on the ceiling itself.
	await expect.poll(() => shown(Day)).toBe('20');
	expect(shown(Month)).toBe('3');
});

test('CSR: a keystroke calls the consumer onChange once with the new date', async () => {
	await render(WithOnChange);

	expect(el(Calls).textContent).toBe('0');
	await typeInto(page.getByTestId('first-dayinput'), '{ArrowUp}');
	await expect.poll(() => el(FirstValue).textContent).toBe('2024-03-31');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(LockedValue).textContent).toBe('');
});

test('CSR: clearing a box calls the consumer onChange with no date', async () => {
	await render(WithOnChange);

	await typeInto(page.getByTestId('first-dayinput'), '{Delete}');
	await expect.poll(() => el(FirstValue).textContent).toBe('null');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

test('CSR: a date nobody may change ignores every key and calls nothing', async () => {
	await render(WithOnChange);
	const locked = page.getByTestId('locked-dayinput');

	// tabindex="-1" keeps a locked box out of the tab order without making it
	// unreachable by script, so the proof is that keys change nothing.
	el(locked).focus();
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('5');
	expect(shown(locked)).toBe('30');
	expect(el(LockedValue).textContent).toBe('');
	expect(el(Calls).textContent).toBe('0');
});

test('CSR: typing a whole date changes what the form submits', async () => {
	await render(BookingForm);

	await typeInto(Month, '{ArrowUp}');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('2024-04-30');
	await expect.poll(() => submit().textContent).toBe('{"arrival":"2024-04-30"}');
});

// A dispatch after a resume reads its first value out of the payload rather than
// out of a live render, which is the class of defect the slider note records.
test('SSR: the first keystroke after a resume steps from the rendered date', async () => {
	await renderSSR(Prefilled);

	await typeInto(Day, '{ArrowUp}');
	await expect.poll(() => shown(Day)).toBe('31');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('2024-03-31');
});

test('SSR: the first digit after a resume lands in the box it was typed in', async () => {
	await renderSSR(Basic);

	await typeInto(Day, '2');
	await expect.poll(() => shown(Day)).toBe('2');
	expect(shown(Month)).toBe('mm');
	expect(shown(Year)).toBe('yyyy');
});

test('SSR: a resumed date keeps the ceiling its month sets', async () => {
	await renderSSR(Prefilled);

	await typeInto(Month, '2');
	await expect.poll(() => shown(Day)).toBe('29');
});
