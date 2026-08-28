import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Bounded from './scenarios/bounded.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import LocaleOrder from './scenarios/locale-order.tsrx';
import MeetingForm from './scenarios/meeting-form.tsrx';
import Prefilled from './scenarios/prefilled.tsrx';
import ReadOnly from './scenarios/readonly.tsrx';
import TwelveHour from './scenarios/twelve-hour.tsrx';
import TwentyFourHour from './scenarios/twenty-four-hour.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';
import WithHelpAndError from './scenarios/with-help-and-error.tsrx';
import WithSeconds from './scenarios/with-seconds.tsrx';

const Root = page.getByTestId('root');
const Label = page.getByTestId('label');
const Hour = page.getByTestId('hourinput');
const Minute = page.getByTestId('minuteinput');
const Second = page.getByTestId('secondinput');
const Period = page.getByTestId('dayperiodinput');
const Field = page.getByTestId('field');
const Description = page.getByTestId('description');
const ErrorMessage = page.getByTestId('error');
const Submitted = page.getByTestId('submitted');
const Value = page.getByTestId('value');
const Calls = page.getByTestId('calls');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

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

function expectBasicRendered() {
	expect(el(Root).getAttribute('role')).toBe('group');
	expect(el(Root).localName).toBe('div');
	expect(el(Label).localName).toBe('label');
	// The label names the group by IDREF, and the id it points at is on the page.
	expect(el(Root).getAttribute('aria-labelledby')).toBe(el(Label).id);
	expect(el(Label).id).not.toBe('');
	expect(el(Root).getAttribute('aria-disabled')).toBe('false');
	expect(el(Root).getAttribute('ui-empty')).toBe('');
	// en-US writes a 12-hour clock, so the period box belongs and it goes last.
	expect(el(Root).getAttribute('ui-hour12')).toBe('');
	expect(el(Root).getAttribute('ui-order')).toBe('hour minute dayperiod');

	for (const box of [Hour, Minute, Period]) {
		expect(el(box).getAttribute('role')).toBe('spinbutton');
		// Every box is a real tab stop, which is `datebox`'s ruling and Bits UI's.
		expect(el(box).getAttribute('tabindex')).toBe('0');
		expect(el(box).hasAttribute('aria-valuenow')).toBe(false);
		expect(el(box).getAttribute('ui-placeholder')).toBe('');
		expect(el(box).getAttribute('ui-value')).toBe('');
		// Neither message part is placed, so both handles drop out and no empty
		// attribute is left behind.
		expect(el(box).hasAttribute('aria-describedby')).toBe(false);
	}

	expect(el(Hour).getAttribute('aria-label')).toBe('hour input');
	expect(el(Minute).getAttribute('aria-label')).toBe('minute input');
	expect(el(Period).getAttribute('aria-label')).toBe('AM or PM');
	// An empty box shows its placeholder as its own text.
	expect(shown(Hour)).toBe('hh');
	expect(shown(Minute)).toBe('mm');
	expect(shown(Period)).toBe('--');
	// Nothing is spelled yet, so the period has no value to speak either.
	expect(el(Period).hasAttribute('aria-valuetext')).toBe(false);
}

// A 12-hour clock runs its hour 1 to 12; minutes and seconds always run 0 to 59.
function expectTwelveHourBoundsRendered() {
	expect(el(Hour).getAttribute('aria-valuemin')).toBe('1');
	expect(el(Hour).getAttribute('aria-valuemax')).toBe('12');
	expect(el(Minute).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Minute).getAttribute('aria-valuemax')).toBe('59');
	expect(el(Period).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Period).getAttribute('aria-valuemax')).toBe('1');
}

function expectPrefilledRendered() {
	// The value is 24-hour whatever the boxes show: 14:30 reads as 2:30 PM.
	expect(shown(Hour)).toBe('2');
	expect(shown(Minute)).toBe('30');
	expect(shown(Period)).toBe('PM');
	expect(el(Hour).getAttribute('aria-valuenow')).toBe('2');
	expect(el(Minute).getAttribute('aria-valuenow')).toBe('30');
	expect(el(Period).getAttribute('aria-valuenow')).toBe('1');
	// The one box whose number says nothing on its own carries the words instead.
	expect(el(Period).getAttribute('aria-valuetext')).toBe('PM');
	expect(el(Hour).hasAttribute('aria-valuetext')).toBe(false);
	expect(el(Minute).hasAttribute('aria-valuetext')).toBe(false);
	expect(el(Root).hasAttribute('ui-empty')).toBe(false);
	expect(el<HTMLInputElement>(Field).value).toBe('14:30');
	expect(el(Field).getAttribute('name')).toBe('starts');
	expect(el(Field).getAttribute('aria-hidden')).toBe('true');
	expect(el(Field).getAttribute('tabindex')).toBe('-1');
	expect(getComputedStyle(el(Field).parentElement as Element).position).toBe('absolute');
}

function expectTwentyFourHourRendered() {
	// de-DE writes a 24-hour clock, so no period box belongs and the hour runs to 23.
	expect(el(Root).hasAttribute('ui-hour12')).toBe(false);
	expect(el(Root).getAttribute('ui-order')).toBe('hour minute');
	expect(el(Hour).getAttribute('aria-valuemin')).toBe('0');
	expect(el(Hour).getAttribute('aria-valuemax')).toBe('23');
	expect(shown(Hour)).toBe('hh');
	expect(shown(Minute)).toBe('mm');
}

function expectSecondsRendered() {
	// Mounting a second box is what puts seconds in the reported time.
	expect(el(Root).getAttribute('ui-order')).toBe('hour minute second');
	expect(el(Second).getAttribute('aria-label')).toBe('second input');
	expect(el(Second).getAttribute('aria-valuemax')).toBe('59');
	expect(shown(Hour)).toBe('09');
	expect(shown(Minute)).toBe('05');
	expect(shown(Second)).toBe('07');
	expect(el<HTMLInputElement>(Field).value).toBe('09:05:07');
}

function expectDisabledRendered() {
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(Root).getAttribute('aria-disabled')).toBe('true');
	for (const box of [Hour, Minute, Period]) {
		expect(el(box).getAttribute('aria-disabled')).toBe('true');
		expect(el(box).getAttribute('tabindex')).toBe('-1');
		expect(el(box).getAttribute('ui-disabled')).toBe('');
	}
	expect(el<HTMLInputElement>(Field).disabled).toBe(true);
}

function expectReadOnlyRendered() {
	expect(el(Root).getAttribute('ui-readonly')).toBe('');
	for (const box of [Hour, Minute, Period]) {
		expect(el(box).getAttribute('aria-readonly')).toBe('true');
		// Read-only is not unreachable: the boxes stay in the tab order so a reader
		// can still review them.
		expect(el(box).getAttribute('tabindex')).toBe('0');
	}
}

function expectBothMessagesRendered() {
	const error = el(ErrorMessage);
	const description = el(Description);
	expect(description.id).toBeTruthy();
	expect(error.id).toBeTruthy();
	expect(description.id).not.toBe(error.id);
	for (const box of [Hour, Minute, Period]) {
		expect(el(box).getAttribute('aria-invalid')).toBe('true');
		// Both ids, error first: the hint is written above the error in this page,
		// so the order is the family's rather than the document's.
		expect(el(box).getAttribute('aria-describedby')).toBe(`${error.id} ${description.id}`);
	}
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a group of empty boxes on the locale's own clock`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
		expectTwelveHourBoundsRendered();
	});

	test(`${mode}: a seeded time fills the boxes and the hidden field`, async () => {
		if (mode === 'CSR') await render(Prefilled);
		else await renderSSR(Prefilled);
		expectPrefilledRendered();
	});

	test(`${mode}: a 24-hour locale renders no period and runs its hour to 23`, async () => {
		if (mode === 'CSR') await render(TwentyFourHour);
		else await renderSSR(TwentyFourHour);
		expectTwentyFourHourRendered();
	});

	test(`${mode}: a mounted second box puts seconds in the reported time`, async () => {
		if (mode === 'CSR') await render(WithSeconds);
		else await renderSSR(WithSeconds);
		expectSecondsRendered();
	});

	test(`${mode}: a 12-hour clock asked for on a 24-hour locale shows a period box`, async () => {
		if (mode === 'CSR') await render(TwelveHour);
		else await renderSSR(TwelveHour);
		expect(el(Root).getAttribute('ui-hour12')).toBe('');
		expect(el(Root).getAttribute('ui-order')).toBe('hour minute dayperiod');
		expect(shown(Hour)).toBe('2');
		expect(shown(Period)).toBe('PM');
		expect(el<HTMLInputElement>(Field).value).toBe('14:30');
	});

	test(`${mode}: a time nobody may change renders its flags on every part`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
	});

	test(`${mode}: a read-only time stays focusable and says so`, async () => {
		if (mode === 'CSR') await render(ReadOnly);
		else await renderSSR(ReadOnly);
		expectReadOnlyRendered();
	});

	test(`${mode}: both messages are named by every box, error first`, async () => {
		if (mode === 'CSR') await render(WithHelpAndError);
		else await renderSSR(WithHelpAndError);
		expectBothMessagesRendered();
	});

	// The locale decides the order, and the period is not always a suffix.
	test(`${mode}: each locale reports the order it writes its own parts in`, async () => {
		if (mode === 'CSR') await render(LocaleOrder);
		else await renderSSR(LocaleOrder);
		expect(el(page.getByTestId('us-root')).getAttribute('ui-order')).toBe(
			'hour minute dayperiod',
		);
		expect(el(page.getByTestId('de-root')).getAttribute('ui-order')).toBe('hour minute');
		expect(el(page.getByTestId('ko-root')).getAttribute('ui-order')).toBe(
			'dayperiod hour minute',
		);
	});

	test(`${mode}: the hidden field submits the whole time under its name`, async () => {
		if (mode === 'CSR') await render(MeetingForm);
		else await renderSSR(MeetingForm);
		expect(el(Field).getAttribute('required')).toBe('');
		await expect.poll(() => submit().textContent).toBe('{"meeting":"14:30"}');
	});

	test(`${mode}: two times on a page keep their own clocks`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expect(el(page.getByTestId('first-root')).getAttribute('ui-hour12')).toBe('');
		expect(el(page.getByTestId('second-root')).hasAttribute('ui-hour12')).toBe(false);
		expect(el(page.getByTestId('first-hourinput')).textContent).toBe('2');
		expect(el(page.getByTestId('second-hourinput')).textContent).toBe('17');
	});
}

// ------------------------------------------------------------- typed digits

test('CSR: typing a digit fills a box and moves on once it can hold no more', async () => {
	await render(Basic);

	// 3 cannot start a two-digit hour on a 12-hour clock, so the box is full at one
	// digit and focus goes on by itself.
	await typeInto(Hour, '3');
	await expect.poll(() => shown(Hour)).toBe('3');
	await expect.poll(() => document.activeElement).toBe(el(Minute));

	// 4 could still become 45, so the box waits for the second digit.
	await userEvent.keyboard('4');
	await expect.poll(() => shown(Minute)).toBe('4');
	expect(document.activeElement).toBe(el(Minute));

	await userEvent.keyboard('5');
	await expect.poll(() => shown(Minute)).toBe('45');
	await expect.poll(() => document.activeElement).toBe(el(Period));
});

test('CSR: a 1 waits for its second digit on a 12-hour clock', async () => {
	await render(Basic);

	await typeInto(Hour, '1');
	await expect.poll(() => shown(Hour)).toBe('1');
	expect(document.activeElement).toBe(el(Hour));

	await userEvent.keyboard('2');
	await expect.poll(() => shown(Hour)).toBe('12');
	await expect.poll(() => document.activeElement).toBe(el(Minute));
});

test('CSR: a 24-hour hour takes a second digit up to 23', async () => {
	await render(TwentyFourHour);

	await typeInto(Hour, '2');
	await expect.poll(() => shown(Hour)).toBe('2');
	expect(document.activeElement).toBe(el(Hour));

	await userEvent.keyboard('3');
	await expect.poll(() => shown(Hour)).toBe('23');
	await expect.poll(() => document.activeElement).toBe(el(Minute));
});

// The clamp is what stops a box holding a number the clock has no room for.
test('CSR: a digit that could only overflow replaces what was there', async () => {
	await render(TwentyFourHour);

	await typeInto(Hour, '2');
	// 25 is not an hour, so the 5 starts the box again rather than overflowing it.
	await userEvent.keyboard('5');
	await expect.poll(() => shown(Hour)).toBe('5');

	await typeInto(Minute, '9');
	// 9 cannot start a two-digit minute either, so the box is full at once.
	await expect.poll(() => shown(Minute)).toBe('9');
	await typeInto(Minute, '5');
	await userEvent.keyboard('9');
	await expect.poll(() => shown(Minute)).toBe('59');
});

test('CSR: the period box takes a and p rather than digits', async () => {
	await render(Prefilled);

	await typeInto(Period, 'a');
	await expect.poll(() => shown(Period)).toBe('AM');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('02:30');

	await userEvent.keyboard('p');
	await expect.poll(() => shown(Period)).toBe('PM');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('14:30');
});

// ------------------------------------------------------------------- arrows

test('CSR: an arrow steps an hour and wraps at the clock\'s own bound', async () => {
	await render(Prefilled);

	await typeInto(Hour, '{ArrowDown}');
	await expect.poll(() => shown(Hour)).toBe('1');

	await userEvent.keyboard('{ArrowDown}');
	// 1 down on a 12-hour clock is 12, not 0.
	await expect.poll(() => shown(Hour)).toBe('12');
	expect(el(Hour).getAttribute('aria-valuenow')).toBe('12');
});

test('CSR: a minute wraps from 59 round to 0', async () => {
	await render(Prefilled);

	await typeInto(Minute, '{End}');
	await expect.poll(() => shown(Minute)).toBe('59');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => shown(Minute)).toBe('0');
	expect(el(Minute).getAttribute('aria-valuenow')).toBe('0');
});

test('CSR: an arrow on the period toggles the half of the day', async () => {
	await render(Prefilled);

	await typeInto(Period, '{ArrowUp}');
	await expect.poll(() => shown(Period)).toBe('AM');
	await expect.poll(() => el(Period).getAttribute('aria-valuetext')).toBe('AM');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('02:30');
});

test('CSR: a page step moves a minute by a quarter of an hour', async () => {
	await render(Prefilled);

	await typeInto(Minute, '{PageUp}');
	await expect.poll(() => shown(Minute)).toBe('45');
});

test('CSR: left and right walk the boxes as well as Tab', async () => {
	await render(Basic);

	el(Hour).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Minute));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Period));

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => document.activeElement).toBe(el(Minute));
});

// ------------------------------------------------------------ placeholders

test('CSR: stepping an empty box lands on its placeholder value', async () => {
	await render(Basic);

	// React Aria's placeholder default, as arithmetic: 12:00 AM on a 12-hour clock.
	await typeInto(Hour, '{ArrowUp}');
	await expect.poll(() => shown(Hour)).toBe('12');

	await typeInto(Minute, '{ArrowUp}');
	await expect.poll(() => shown(Minute)).toBe('0');

	await typeInto(Period, '{ArrowUp}');
	await expect.poll(() => shown(Period)).toBe('AM');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('00:00');
});

test('CSR: an empty box on a 24-hour clock starts from midnight', async () => {
	await render(TwentyFourHour);

	await typeInto(Hour, '{ArrowDown}');
	await expect.poll(() => shown(Hour)).toBe('0');
});

// --------------------------------------------------------------- backspace

test('CSR: backspace erases a digit and then walks back a box', async () => {
	await render(Prefilled);

	await typeInto(Minute, '{Backspace}');
	await expect.poll(() => shown(Minute)).toBe('3');
	expect(document.activeElement).toBe(el(Minute));

	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => shown(Minute)).toBe('mm');
	expect(document.activeElement).toBe(el(Minute));

	await userEvent.keyboard('{Backspace}');
	await expect.poll(() => document.activeElement).toBe(el(Hour));
	expect(shown(Hour)).toBe('2');
});

test('CSR: clearing one box empties the time without touching the others', async () => {
	await render(Prefilled);

	await typeInto(Minute, '{Delete}');
	await expect.poll(() => shown(Minute)).toBe('mm');
	expect(el(Minute).hasAttribute('aria-valuenow')).toBe(false);
	expect(shown(Hour)).toBe('2');
	expect(shown(Period)).toBe('PM');
	expect(el<HTMLInputElement>(Field).value).toBe('');
});

// ------------------------------------------------------------------ bounds

test('CSR: a time stepped past a bound is pulled back to it', async () => {
	await render(Bounded);

	await typeInto(Hour, '{Home}');
	// Midnight is before the 09:00 floor, so the whole time settles on the bound.
	await expect.poll(() => shown(Hour)).toBe('9');
	expect(shown(Minute)).toBe('0');
	expect(el<HTMLInputElement>(Field).value).toBe('09:00');

	await typeInto(Hour, '{End}');
	await expect.poll(() => shown(Hour)).toBe('17');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('17:00');
});

// ------------------------------------------------------------------ change

test('CSR: a keystroke calls the consumer onChange once with the new time', async () => {
	await render(Controlled);

	expect(el(Calls).textContent).toBe('0');
	await typeInto(Hour, '{ArrowUp}');
	await expect.poll(() => el(Value).textContent).toBe('15:30');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

test('CSR: clearing a box calls the consumer onChange with no time', async () => {
	await render(Controlled);

	await typeInto(Minute, '{Delete}');
	await expect.poll(() => el(Value).textContent).toBe('null');
	await expect.poll(() => el(Calls).textContent).toBe('1');
});

test('CSR: a time nobody may change ignores every key', async () => {
	await render(Disabled);

	// tabindex="-1" keeps a locked box out of the tab order without making it
	// unreachable by script, so the proof is that keys change nothing.
	el(Hour).focus();
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('5');
	expect(shown(Hour)).toBe('2');
	expect(el<HTMLInputElement>(Field).value).toBe('14:30');
});

test('CSR: a read-only time can be walked but not edited', async () => {
	await render(ReadOnly);

	await typeInto(Hour, '{ArrowUp}');
	expect(shown(Hour)).toBe('2');
	await typeInto(Hour, '5');
	expect(shown(Hour)).toBe('2');
	expect(el<HTMLInputElement>(Field).value).toBe('14:30');
});

test('CSR: typing a whole time changes what the form submits', async () => {
	await render(MeetingForm);

	await typeInto(Hour, '{ArrowUp}');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('15:30');
	await expect.poll(() => submit().textContent).toBe('{"meeting":"15:30"}');
});

test('CSR: typing in one time on a page leaves the other where it was', async () => {
	await render(TwoWidgets);

	await typeInto(page.getByTestId('first-hourinput'), '{ArrowUp}');
	await expect.poll(() => el(page.getByTestId('first-hourinput')).textContent).toBe('3');
	expect(el(page.getByTestId('second-hourinput')).textContent).toBe('17');
	expect(el<HTMLInputElement>(page.getByTestId('second-field')).value).toBe('17:45');
});

// --------------------------------------------------------------------- SSR

// A dispatch after a resume reads its first value out of the payload rather than
// out of a live render, which is the class of defect the slider note records.
test('SSR: the first keystroke after a resume steps from the rendered time', async () => {
	await renderSSR(Prefilled);

	await typeInto(Hour, '{ArrowUp}');
	await expect.poll(() => shown(Hour)).toBe('3');
	await expect.poll(() => el<HTMLInputElement>(Field).value).toBe('15:30');
});

test('SSR: the first digit after a resume lands in the box it was typed in', async () => {
	await renderSSR(Basic);

	await typeInto(Minute, '4');
	await expect.poll(() => shown(Minute)).toBe('4');
	expect(shown(Hour)).toBe('hh');
	expect(shown(Period)).toBe('--');
});

test('SSR: a resumed time keeps the clock its locale set', async () => {
	await renderSSR(TwentyFourHour);

	await typeInto(Hour, '{ArrowDown}');
	await expect.poll(() => shown(Hour)).toBe('0');
	expect(el(Hour).getAttribute('aria-valuemax')).toBe('23');
});

// --------------------------------------------------------------------- axe

for (const mode of MODES) {
	test(`axe finds nothing on the starter in ${mode}`, async () => {
		const result = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(result), `the starter is resting in ${mode}`);
	});

	test(`axe finds nothing on a seeded time in ${mode}`, async () => {
		const result = mode === 'CSR' ? await render(Prefilled) : await renderSSR(Prefilled);
		await expectNoAxeViolations(scopeOf(result), `a seeded time is resting in ${mode}`);
	});

	test(`axe finds nothing on a 24-hour time with seconds in ${mode}`, async () => {
		const result = mode === 'CSR' ? await render(WithSeconds) : await renderSSR(WithSeconds);
		await expectNoAxeViolations(scopeOf(result), `a time with seconds is resting in ${mode}`);
	});

	test(`axe finds nothing on a time nobody may change in ${mode}`, async () => {
		const result = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(scopeOf(result), `a disabled time is resting in ${mode}`);
	});

	test(`axe finds nothing on a time carrying both messages in ${mode}`, async () => {
		const result =
			mode === 'CSR' ? await render(WithHelpAndError) : await renderSSR(WithHelpAndError);
		await expectNoAxeViolations(scopeOf(result), `both messages are shown in ${mode}`);
	});
}

test('axe finds nothing once a time has been typed into', async () => {
	const result = await render(Basic);

	await typeInto(Hour, '3');
	await expect.poll(() => shown(Hour)).toBe('3');
	await expectNoAxeViolations(scopeOf(result), 'an hour has been typed');
});
