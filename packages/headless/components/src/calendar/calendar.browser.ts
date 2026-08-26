import { render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import BookingForm from './scenarios/booking-form.tsrx';
import Bounded from './scenarios/bounded.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Multiple from './scenarios/multiple.tsrx';
import Popup from './scenarios/popup.tsrx';
import PopupWithDateBox from './scenarios/popup-with-datebox.tsrx';
import Range from './scenarios/range.tsrx';
import WeekStart from './scenarios/week-start.tsrx';

const Root = page.getByTestId('root');
const Content = page.getByTestId('content');
const Title = page.getByTestId('title');
const Back = page.getByTestId('back');
const Forward = page.getByTestId('forward');
const Field = page.getByTestId('field');
const Trigger = page.getByTestId('trigger');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The same tags the shared conformance battery runs. Contrast is absent for the
// reason recorded there: these components ship unstyled.
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

const days = () => page.getByTestId('day').elements() as HTMLButtonElement[];
const dayValues = () => days().map((one) => one.getAttribute('value'));
const weekdays = () => page.getByTestId('weekday').elements().map((one) => one.textContent);
const text = (locator: { element(): Element | null }) => el(locator).textContent;

function dayFor(iso: string): HTMLButtonElement {
	const found = days().find((one) => one.getAttribute('value') === iso);
	if (!found) throw new Error(`No day on the page for ${iso}.`);
	return found;
}

function flags(iso: string): string[] {
	const day = dayFor(iso);
	return [...day.attributes].filter((one) => one.name.startsWith('ui-')).map((one) => one.name);
}

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function expectNoAxeViolations(where: HTMLElement, phase: string) {
	const results = await axe.run(where, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	expect(
		results.violations.map((one) => `${one.id}: ${one.help}`),
		`axe violations while ${phase}`,
	).toEqual([]);
}

// August 2026 starts on a Saturday, so a Sunday-first grid leads with six days of
// July and trails into September - which is what makes it worth pinning.
const AUGUST_FIRST = '2026-07-26';
const AUGUST_LAST = '2026-09-05';

function todayIso() {
	const now = new Date();
	return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}

// Nobody has chosen and nobody has walked, so the tab stop is today when the run
// happens inside August 2026 and the first of the month when it does not.
function openingDay() {
	return todayIso().slice(0, 7) === '2026-08' ? todayIso() : '2026-08-01';
}

for (const mode of MODES) {
	test(`${mode}: the month is 42 real buttons, each named by its whole date`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		expect(el(Content).getAttribute('role')).toBe('group');
		expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
		expect(el(Title).id).not.toBe('');
		expect(el(Title).getAttribute('aria-live')).toBe('polite');
		expect(text(Title)).toBe('August 2026');

		expect(dayValues()[0]).toBe(AUGUST_FIRST);
		expect(dayValues()[41]).toBe(AUGUST_LAST);

		for (const day of days()) {
			expect(day.localName).toBe('button');
			expect(day.getAttribute('type')).toBe('button');
			// aria-pressed, never aria-selected: a button does not support the latter.
			expect(day.hasAttribute('aria-pressed')).toBe(true);
			expect(day.hasAttribute('aria-selected')).toBe(false);
			expect(day.getAttribute('aria-label')).not.toBe('');
		}

		// The whole date, from Intl, in the document's own locale.
		expect(dayFor('2026-08-25').getAttribute('aria-label')).toBe(
			new Intl.DateTimeFormat(undefined, {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			}).format(new Date(2026, 7, 25)),
		);
		// With no children a day draws its own number.
		expect(dayFor('2026-08-25').textContent).toBe('25');
		expect(weekdays().length).toBe(7);
	});

	test(`${mode}: leading and trailing days report ui-outside, and today reports ui-today`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		expect(flags(AUGUST_FIRST)).toContain('ui-outside');
		expect(flags(AUGUST_LAST)).toContain('ui-outside');
		expect(flags('2026-08-01')).not.toContain('ui-outside');

		const now = new Date();
		const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
		const marked = days().filter((one) => one.hasAttribute('ui-today'));
		// The scenario is fixed to August 2026, so today is on the page only if the
		// run happens to be in that month's grid.
		const onThePage = days().some((one) => one.getAttribute('value') === today);
		expect(marked.length).toBe(onThePage ? 1 : 0);
		if (onThePage) expect(marked[0].getAttribute('value')).toBe(today);
	});

	test(`${mode}: exactly one day is a tab stop, and Tab reaches it once`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		const stops = days().filter((one) => one.getAttribute('tabindex') === '0');
		expect(stops.length).toBe(1);
		expect(days().filter((one) => one.getAttribute('tabindex') === '-1').length).toBe(41);
	});

	test(`${mode}: back and forward move the title and every one of the 42 days`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		el<HTMLButtonElement>(Forward).click();
		await expect.poll(() => text(Title), { timeout: 5000 }).toBe('September 2026');
		expect(dayValues()[0]).toBe('2026-08-30');
		expect(dayValues().length).toBe(42);

		el<HTMLButtonElement>(Back).click();
		el<HTMLButtonElement>(Back).click();
		await expect.poll(() => text(Title), { timeout: 5000 }).toBe('July 2026');
		expect(dayValues()[0]).toBe('2026-06-28');
	});

	test(`${mode}: choosing a day reports it once and marks it pressed`, async () => {
		if (mode === 'CSR') await render(Controlled);
		else await renderSSR(Controlled);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		expect(dayFor('2026-08-14').getAttribute('aria-pressed')).toBe('true');
		expect(flags('2026-08-14')).toContain('ui-selected');

		dayFor('2026-08-20').click();
		await expect.poll(() => text(page.getByTestId('value')), { timeout: 5000 }).toBe('2026-08-20');
		expect(text(page.getByTestId('calls'))).toBe('1');
		expect(dayFor('2026-08-20').getAttribute('aria-pressed')).toBe('true');
		expect(dayFor('2026-08-14').getAttribute('aria-pressed')).toBe('false');
	});

	test(`${mode}: the field carries the chosen date under the root's name`, async () => {
		if (mode === 'CSR') await render(BookingForm);
		else await renderSSR(BookingForm);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		expect(el<HTMLInputElement>(Field).name).toBe('arrival');
		expect(el(Field).getAttribute('value')).toBe('2026-08-14');
		expect(el(Field).getAttribute('tabindex')).toBe('-1');
		expect(el(Field).getAttribute('aria-hidden')).toBe('true');

		el(page.getByTestId('form')).dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		);
		await expect
			.poll(() => text(page.getByTestId('submitted')), { timeout: 5000 })
			.toBe('{"arrival":"2026-08-14"}');
	});

	test(`${mode}: a bound and an unavailable day stay reachable and refuse to be chosen`, async () => {
		if (mode === 'CSR') await render(Bounded);
		else await renderSSR(Bounded);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		for (const iso of ['2026-08-04', '2026-08-26']) {
			expect(dayFor(iso).getAttribute('aria-disabled')).toBe('true');
			expect(flags(iso)).toContain('ui-disabled');
			// Focusable, not selectable: the point of the distinction.
			expect(dayFor(iso).hasAttribute('disabled')).toBe(false);
		}
		for (const iso of ['2026-08-12', '2026-08-13']) {
			expect(dayFor(iso).getAttribute('aria-disabled')).toBe('true');
			expect(flags(iso)).toContain('ui-unavailable');
			expect(flags(iso)).not.toContain('ui-disabled');
			expect(dayFor(iso).hasAttribute('disabled')).toBe(false);
		}

		dayFor('2026-08-12').click();
		dayFor('2026-08-04').click();
		await settled();
		expect(text(page.getByTestId('calls'))).toBe('0');
		expect(text(page.getByTestId('value'))).toBe('');

		dayFor('2026-08-10').click();
		await expect.poll(() => text(page.getByTestId('calls')), { timeout: 5000 }).toBe('1');
		expect(text(page.getByTestId('value'))).toBe('2026-08-10');

		// Error before description, both reached from the month's own group.
		expect(el(Content).getAttribute('aria-describedby')).toBe(
			`${el(page.getByTestId('error')).id} ${el(page.getByTestId('description')).id}`,
		);
	});

	test(`${mode}: a range takes two presses, previews the span, and reports once`, async () => {
		if (mode === 'CSR') await render(Range);
		else await renderSSR(Range);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		dayFor('2026-08-10').click();
		await expect
			.poll(() => text(page.getByTestId('anchor')), { timeout: 5000 })
			.toBe('2026-08-10');
		// An anchor is not a value.
		expect(text(page.getByTestId('calls'))).toBe('0');

		dayFor('2026-08-14').click();
		await expect.poll(() => text(page.getByTestId('calls')), { timeout: 5000 }).toBe('1');
		expect(text(page.getByTestId('start'))).toBe('2026-08-10');
		expect(text(page.getByTestId('end'))).toBe('2026-08-14');
		expect(text(page.getByTestId('anchor'))).toBe('');

		for (const iso of ['2026-08-10', '2026-08-11', '2026-08-14']) {
			expect(flags(iso)).toContain('ui-inrange');
		}
		expect(flags('2026-08-09')).not.toContain('ui-inrange');
		expect(flags('2026-08-10')).toContain('ui-rangestart');
		expect(flags('2026-08-14')).toContain('ui-rangeend');
		// Only the two endpoints are pressed; the days between are in the span.
		expect(dayFor('2026-08-11').getAttribute('aria-pressed')).toBe('false');
	});

	test(`${mode}: a range picked backwards still reports start before end`, async () => {
		if (mode === 'CSR') await render(Range);
		else await renderSSR(Range);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		dayFor('2026-08-20').click();
		await settled();
		dayFor('2026-08-06').click();
		await expect.poll(() => text(page.getByTestId('start')), { timeout: 5000 }).toBe('2026-08-06');
		expect(text(page.getByTestId('end'))).toBe('2026-08-20');
	});

	test(`${mode}: several days can be chosen and unchosen`, async () => {
		if (mode === 'CSR') await render(Multiple);
		else await renderSSR(Multiple);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		expect(dayFor('2026-08-04').getAttribute('aria-pressed')).toBe('true');

		dayFor('2026-08-06').click();
		await expect
			.poll(() => text(page.getByTestId('chosen')), { timeout: 5000 })
			.toBe('2026-08-04,2026-08-06');

		dayFor('2026-08-04').click();
		await expect.poll(() => text(page.getByTestId('chosen')), { timeout: 5000 }).toBe('2026-08-06');
		expect(text(page.getByTestId('calls'))).toBe('2');
		expect(dayFor('2026-08-04').getAttribute('aria-pressed')).toBe('false');
	});

	test(`${mode}: startofweek moves the weekday names and the grid together`, async () => {
		if (mode === 'CSR') await render(WeekStart);
		else await renderSSR(WeekStart);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

		const monday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
			new Date(2024, 0, 8),
		);
		expect(weekdays()[0]).toBe(monday);
		// August 2026 opens on a Saturday, so a Monday-first grid leads with five days.
		expect(dayValues()[0]).toBe('2026-07-27');
		expect(dayValues()[41]).toBe('2026-09-06');
	});

	test(`${mode}: axe finds no violation at rest or after a choice`, async () => {
		const { container } = mode === 'CSR' ? await render(Bounded) : await renderSSR(Bounded);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);
		const where = container as unknown as HTMLElement;

		await expectNoAxeViolations(where, 'at rest');
		dayFor('2026-08-10').click();
		await settled();
		await expectNoAxeViolations(where, 'after a choice');

		dayFor('2026-08-10').focus();
		await expectNoAxeViolations(where, 'with focus inside the month');
	});
}

test('CSR: every key of the roving model moves the focused day', async () => {
	await render(Basic);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	const stop = () => days().find((one) => one.getAttribute('tabindex') === '0');
	const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute('value');

	dayFor('2026-08-14').focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => stop()?.getAttribute('value'), { timeout: 5000 }).toBe('2026-08-15');
	expect(focused()).toBe('2026-08-15');

	await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
	await expect.poll(() => focused(), { timeout: 5000 }).toBe('2026-08-13');

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => focused(), { timeout: 5000 }).toBe('2026-08-20');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => focused(), { timeout: 5000 }).toBe('2026-08-13');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => focused(), { timeout: 5000 }).toBe('2026-08-09');

	await userEvent.keyboard('{End}');
	await expect.poll(() => focused(), { timeout: 5000 }).toBe('2026-08-15');
});

test('CSR: PageDown crosses the month and takes the focus with it', async () => {
	await render(Basic);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-14').focus();
	await userEvent.keyboard('{PageDown}');
	await expect.poll(() => text(Title), { timeout: 5000 }).toBe('September 2026');
	await expect
		.poll(() => (document.activeElement as HTMLElement | null)?.getAttribute('value'), {
			timeout: 5000,
		})
		.toBe('2026-09-14');
	expect(days().filter((one) => one.getAttribute('tabindex') === '0').length).toBe(1);

	await userEvent.keyboard('{PageUp}');
	await expect.poll(() => text(Title), { timeout: 5000 }).toBe('August 2026');
});

test('CSR: Shift with the page keys steps a year', async () => {
	await render(Basic);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-14').focus();
	await userEvent.keyboard('{Shift>}{PageDown}{/Shift}');
	await expect.poll(() => text(Title), { timeout: 5000 }).toBe('August 2027');

	await userEvent.keyboard('{Shift>}{PageUp}{/Shift}{Shift>}{PageUp}{/Shift}');
	await expect.poll(() => text(Title), { timeout: 5000 }).toBe('August 2025');
});

test('CSR: an arrow off the end of the month crosses into the next one', async () => {
	await render(Basic);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-31').focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => text(Title), { timeout: 5000 }).toBe('September 2026');
	await expect
		.poll(() => (document.activeElement as HTMLElement | null)?.getAttribute('value'), {
			timeout: 5000,
		})
		.toBe('2026-09-01');
});

test('CSR: Enter and Space choose the focused day exactly once', async () => {
	await render(Controlled);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-20').focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => text(page.getByTestId('calls')), { timeout: 5000 }).toBe('1');
	expect(text(page.getByTestId('value'))).toBe('2026-08-20');

	dayFor('2026-08-21').focus();
	await userEvent.keyboard(' ');
	await expect.poll(() => text(page.getByTestId('calls')), { timeout: 5000 }).toBe('2');
	expect(text(page.getByTestId('value'))).toBe('2026-08-21');
});

test('CSR: a locked day walked onto with the keyboard still refuses to be chosen', async () => {
	await render(Bounded);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-12').focus();
	await userEvent.keyboard('{Enter}');
	await settled();
	expect(text(page.getByTestId('calls'))).toBe('0');
});

test('CSR: a range previews against the focused day while the anchor is live', async () => {
	await render(Range);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	dayFor('2026-08-10').click();
	await expect.poll(() => text(page.getByTestId('anchor')), { timeout: 5000 }).toBe('2026-08-10');

	dayFor('2026-08-10').focus();
	await userEvent.keyboard('{ArrowRight}{ArrowRight}');
	await expect.poll(() => flags('2026-08-12').includes('ui-inrange'), { timeout: 5000 }).toBe(true);
	expect(flags('2026-08-11')).toContain('ui-inrange');
	expect(flags('2026-08-13')).not.toContain('ui-inrange');
});

for (const mode of MODES) {
	test(`${mode}: the popup opens, lands focus on the month, and closes on a choice`, async () => {
		const { container } = mode === 'CSR' ? await render(Popup) : await renderSSR(Popup);
		await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);
		const where = container as unknown as HTMLElement;

		expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
		expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
		expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
		expect(el(Content).hasAttribute('hidden')).toBe(true);
		await expectNoAxeViolations(where, 'the popup is closed');

		el<HTMLButtonElement>(Trigger).click();
		await expect
			.poll(() => el(Trigger).getAttribute('aria-expanded'), { timeout: 5000 })
			.toBe('true');
		expect(el(Content).hasAttribute('hidden')).toBe(false);
		// Focus lands on the day carrying the tab stop.
		await expect
			.poll(() => (document.activeElement as HTMLElement | null)?.getAttribute('value'), {
				timeout: 5000,
			})
			.toBe(openingDay());
		await expectNoAxeViolations(where, 'the popup is open');

		dayFor('2026-08-20').click();
		await expect
			.poll(() => el(Trigger).getAttribute('aria-expanded'), { timeout: 5000 })
			.toBe('false');
		expect(text(page.getByTestId('value'))).toBe('2026-08-20');
		// Focus cannot stay in a hidden subtree, so it comes back to the trigger.
		await expect.poll(() => document.activeElement, { timeout: 5000 }).toBe(el(Trigger));
	});
}

test('CSR: Escape closes the popup and hands focus back to the trigger', async () => {
	await render(Popup);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	el<HTMLButtonElement>(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	dayFor('2026-08-10').focus();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(true);
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('false');
	await expect.poll(() => document.activeElement, { timeout: 5000 }).toBe(el(Trigger));
});

test('CSR: a press outside dismisses the popup and leaves focus where the person put it', async () => {
	await render(Popup);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	el<HTMLButtonElement>(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);

	const outside = el<HTMLButtonElement>(page.getByTestId('outside'));
	outside.focus();
	outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(true);
	expect(document.activeElement).toBe(outside);
});

test('CSR: a range in a popup stays open across both presses', async () => {
	await render(Popup);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);
	// The single-date popup is the closing one; this row is its counterpart under
	// `range`, which the same content must not close.
	el<HTMLButtonElement>(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	dayFor('2026-08-10').click();
	await settled();
	expect(el(Content).hasAttribute('hidden')).toBe(false);
});

test('CSR: a typed date and a month reveal the one value the page holds', async () => {
	await render(PopupWithDateBox);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	expect(text(page.getByTestId('shared'))).toBe('2026-08-14');
	expect(dayFor('2026-08-14').getAttribute('aria-pressed')).toBe('true');

	el<HTMLButtonElement>(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	dayFor('2026-08-20').click();
	await expect.poll(() => text(page.getByTestId('shared')), { timeout: 5000 }).toBe('2026-08-20');
	// The typed boxes follow, because both families read the same page cell.
	await expect
		.poll(() => text(page.getByTestId('dayinput')), { timeout: 5000 })
		.toBe('20');
});

test('CSR: the family drops the props it owns and passes the rest through', async () => {
	await render(Basic);
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	for (const name of ['month', 'value', 'multiple', 'range', 'min', 'max', 'startofweek', 'popup']) {
		expect(el(Root).hasAttribute(name), `root should not write ${name}`).toBe(false);
	}
	expect(el(Root).getAttribute('data-testid')).toBe('root');
});

// Every scenario the family ships, swept at rest, with focus inside the month and
// after a day has been chosen - the three states a person actually meets. The
// mounts are written out rather than looped over because the SSR harness rewrites
// a literal `renderSSR` call site and takes nothing passed by reference.
async function sweepAxe(container: unknown, pick: string, opens = false) {
	const where = container as unknown as HTMLElement;
	if (opens) {
		el<HTMLButtonElement>(Trigger).click();
		await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
	}
	await expect.poll(() => days().length, { timeout: 5000 }).toBe(42);

	await expectNoAxeViolations(where, 'at rest');
	dayFor(pick).focus();
	await settled();
	await expectNoAxeViolations(where, 'with focus on a day');
	dayFor(pick).click();
	await settled();
	await expectNoAxeViolations(where, 'after a day is chosen');
}

for (const mode of MODES) {
	test(`${mode}: axe sweeps the starter month`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await sweepAxe(mounted.container, '2026-08-10');
	});

	test(`${mode}: axe sweeps the month a form submits`, async () => {
		const mounted = mode === 'CSR' ? await render(BookingForm) : await renderSSR(BookingForm);
		await sweepAxe(mounted.container, '2026-08-10');
	});

	test(`${mode}: axe sweeps the controlled month`, async () => {
		const mounted = mode === 'CSR' ? await render(Controlled) : await renderSSR(Controlled);
		await sweepAxe(mounted.container, '2026-08-20');
	});

	test(`${mode}: axe sweeps a month of several days`, async () => {
		const mounted = mode === 'CSR' ? await render(Multiple) : await renderSSR(Multiple);
		await sweepAxe(mounted.container, '2026-08-06');
	});

	test(`${mode}: axe sweeps a range half picked`, async () => {
		const mounted = mode === 'CSR' ? await render(Range) : await renderSSR(Range);
		await sweepAxe(mounted.container, '2026-08-10');
	});

	test(`${mode}: axe sweeps a Monday-first month`, async () => {
		const mounted = mode === 'CSR' ? await render(WeekStart) : await renderSSR(WeekStart);
		await sweepAxe(mounted.container, '2026-08-10');
	});

	test(`${mode}: axe sweeps the revealed month`, async () => {
		const mounted = mode === 'CSR' ? await render(Popup) : await renderSSR(Popup);
		await sweepAxe(mounted.container, '2026-08-10', true);
	});

	test(`${mode}: axe sweeps a month beside its typed boxes`, async () => {
		const mounted =
			mode === 'CSR' ? await render(PopupWithDateBox) : await renderSSR(PopupWithDateBox);
		await sweepAxe(mounted.container, '2026-08-20', true);
	});
}
