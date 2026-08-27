import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * The claim a real reader is here to test is the family's largest divergence from
 * every reference: 42 real `<button>` days and no grid semantics at all. So what
 * is asserted is that each day is announced as a button carrying its whole date,
 * that a day nobody may choose says so and still refuses when pressed, and that
 * the month's group is renamed by the title whenever the month moves. A grid's
 * row and column chatter is what this family deliberately does not produce, and
 * nothing here asks for it.
 *
 * A day's expected name is read off the element rather than rebuilt from `Intl`:
 * the page's locale is the browser's and this file runs in node, so restating the
 * format here would pass or fail for reasons unrelated to the announcement.
 *
 * Not asserted: `aria-pressed`, which neither reader has a `Vocabulary` slot for -
 * chosen-ness is asserted on the element instead, the way datebox asserts bounds.
 */

// The calendar section is the last on the gallery page and serves 42 days, so a
// walk that starts at the top of the document needs more steps than any other
// family's.
const WALK_LIMIT = 420;
const CHANGE_TIMEOUT_MS = 15_000;

// The gallery pins August 2026 and one day in it that may not be chosen.
const PLAIN = '2026-08-03';
const SELECTED = '2026-08-14';
const UNAVAILABLE = '2026-08-19';
const BEFORE_SELECTED = '2026-08-13';
const NEXT_MONTH_SAME_DAY = '2026-09-14';

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

async function expectSpeaksOnFocus(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.settleOnFocus(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

export async function readCalendarTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.calendar.slice(2)}`);
	// The days are the buttons carrying a date; back and forward are not.
	const days = section.locator('button[value]');
	const dayFor = (iso: string) => section.locator(`button[value="${iso}"]`);
	const month = section.getByRole('group');
	// `calendar.title` is the one heading that reports its own changes.
	const title = section.locator('h2[aria-live="polite"]');

	await expect(days).toHaveCount(42);

	const resting = (await title.textContent()) ?? '';
	expect(resting).not.toBe('');
	// The month's group is named by the title, so the name a reader hears follows
	// the month on show.
	await expect(month).toHaveAccessibleName(resting);

	const plainName = (await dayFor(PLAIN).getAttribute('aria-label')) ?? '';
	const unavailableName = (await dayFor(UNAVAILABLE).getAttribute('aria-label')) ?? '';
	const selectedName = (await dayFor(SELECTED).getAttribute('aria-label')) ?? '';
	expect(plainName).not.toBe('');

	// The whole date is in the name, which is the fact a grid's row and column
	// position exists to convey - and the reason this family ships neither.
	const plain: Conveys = { role: 'button', name: plainName };
	expectConveys(sr, await readUntil(sr, plain, WALK_LIMIT), plain);

	// A day already chosen. `aria-pressed`, never `aria-selected`: a button does
	// not support the latter.
	await expect(dayFor(SELECTED)).toHaveAttribute('aria-pressed', 'true');
	await expect(dayFor(SELECTED)).toHaveAccessibleName(selectedName);
	await expect(dayFor(PLAIN)).toHaveAttribute('aria-pressed', 'false');

	// Today is marked whenever the run happens inside the month the gallery pins.
	const today = await page.evaluate(() => {
		const now = new Date();
		return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
	});
	const values = await days.evaluateAll((all) =>
		all.map((one) => one.getAttribute('value') ?? ''),
	);
	const marked = section.locator('button[ui-today]');
	await expect(marked).toHaveCount(values.includes(today) ? 1 : 0);
	if (values.includes(today)) await expect(marked).toHaveAttribute('value', today);

	// A day nobody may choose stays reachable and says why, which is the
	// distinction most home-grown calendars miss.
	const unavailable: Conveys = { role: 'button', name: unavailableName, state: ['disabled'] };
	await expect(dayFor(UNAVAILABLE)).toHaveAttribute('aria-disabled', 'true');
	await expect(dayFor(UNAVAILABLE)).not.toHaveAttribute('disabled', '');
	await dayFor(UNAVAILABLE).focus();
	await expectSpeaksOnFocus(sr, unavailable);
	await sr.press(sr.keys.enter);
	// It refuses in the handler rather than in the markup, so nothing is chosen.
	await expect(dayFor(UNAVAILABLE)).toHaveAttribute('aria-pressed', 'false');
	await expect(dayFor(SELECTED)).toHaveAttribute('aria-pressed', 'true');

	// An arrow walks a day, and the reader follows the focus onto it.
	await dayFor(BEFORE_SELECTED).focus();
	await sr.settleOnFocus();
	await sr.press(sr.keys.arrowRight);
	await expect(dayFor(SELECTED)).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expectSpeaksOnFocus(sr, { role: 'button', name: selectedName });

	// Back and forward move the title, and the group's name moves with it.
	await section.getByRole('button', { name: 'Next month' }).click();
	await expect(title).not.toHaveText(resting, { timeout: CHANGE_TIMEOUT_MS });
	const moved = (await title.textContent()) ?? '';
	await expect(month).toHaveAccessibleName(moved);
	await section.getByRole('button', { name: 'Previous month' }).click();
	await expect(title).toHaveText(resting, { timeout: CHANGE_TIMEOUT_MS });
	await expect(month).toHaveAccessibleName(resting);

	// Crossing a month is not a special case: the date moves and the visible
	// month follows it, carrying the focus.
	await dayFor(SELECTED).focus();
	await sr.settleOnFocus();
	// No `Keys` slot: the page keys are this family's alone, so they are named here.
	await sr.press('PageDown');
	await expect(title).not.toHaveText(resting, { timeout: CHANGE_TIMEOUT_MS });
	await expect(dayFor(NEXT_MONTH_SAME_DAY)).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	const crossedName = (await dayFor(NEXT_MONTH_SAME_DAY).getAttribute('aria-label')) ?? '';
	await expectSpeaksOnFocus(sr, { role: 'button', name: crossedName });
}
