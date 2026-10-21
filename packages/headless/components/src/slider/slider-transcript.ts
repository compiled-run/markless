import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../sr-app/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam, for the same reason
 * `./slider.sr.ts` keeps its own word table: this family has no `Vocabulary` slot.
 * Its role has none, and a value is spoken as a phrase around a number rather
 * than as a fixed word, so which separators a real reader puts between a
 * slider's facts has never been observed. Containment in the whole phrase is
 * what can be asserted honestly until a CI run prints one.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const NAME = 'Volume';
const RANGE_NAME = 'Price';

// Both readers' documented role word for `role="slider"`, and the only slider
// fact whose wording either one has on record.
const ROLE = 'slider';

// The thumb carries `aria-valuenow` as the bare number, so the value a reader
// speaks is that number however it wraps it.
const RESTING = 40;
const STEPPED_UP = 41;
const STEPPED_DOWN = 40;

// The range slider's two resting values. Each thumb's far bound is the other
// thumb's value, so a thumb cannot be dragged past its neighbour.
const RANGE_START = 20;
const RANGE_END = 80;
const RANGE_MIN = 0;
const RANGE_MAX = 100;

function missing(phrase: string, facts: readonly string[]): string[] {
	return facts.filter((fact) => !phrase.includes(fact));
}

// A step reaches the DOM after the dispatch the keystroke woke returns, and a
// real reader speaks on its own schedule on top of that, so the reader is asked
// again until the new value is what it reads.
async function expectAnnouncesAfterChange(sr: ScreenReaderDriver, facts: readonly string[]) {
	await expect
		.poll(async () => missing(await sr.reannounce(), facts), { timeout: CHANGE_TIMEOUT_MS })
		.toEqual([]);
}

/**
 * The range section, the next one down.
 *
 * Both thumbs are labelled by the one `<slider.label>` the family renders, so a
 * reader says "Price" on each of them and nothing in either phrase tells them
 * apart by name. That is what the shipped component does, so it is what this
 * pins; whether a range should name its thumbs separately is an open question,
 * not something to paper over here.
 */
async function readRangeSection(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS['slider-range'].slice(2)}`);
	const thumbs = section.getByRole('slider');
	const startThumb = thumbs.nth(0);
	const endThumb = thumbs.nth(1);

	await expect(thumbs).toHaveCount(2);

	// Same bounds discipline as above, plus the crossing: each thumb's far bound
	// is the other thumb's current value rather than the track's own end.
	await expect(startThumb).toHaveAttribute('aria-valuemin', String(RANGE_MIN));
	await expect(startThumb).toHaveAttribute('aria-valuemax', String(RANGE_END));
	await expect(startThumb).toHaveAttribute('aria-valuenow', String(RANGE_START));
	await expect(endThumb).toHaveAttribute('aria-valuemin', String(RANGE_START));
	await expect(endThumb).toHaveAttribute('aria-valuemax', String(RANGE_MAX));
	await expect(endThumb).toHaveAttribute('aria-valuenow', String(RANGE_END));

	// The shared name, asserted on the elements because a phrase carrying "Price"
	// twice cannot by itself show that both thumbs resolve to the same name.
	await expect(startThumb).toHaveAccessibleName(RANGE_NAME);
	await expect(endThumb).toHaveAccessibleName(RANGE_NAME);

	// Each thumb read on focus, as a person tabbing through it hears it: NVDA's browse mode drops a
	// slider's name when the label text was just read above it.
	const startFacts = [ROLE, RANGE_NAME, String(RANGE_START)];
	await startThumb.focus();
	const start = await sr.settleOnFocus();
	expect(missing(start, startFacts), `${sr.name} announced "${start}"`).toEqual([]);

	const endFacts = [ROLE, RANGE_NAME, String(RANGE_END)];
	await endThumb.focus();
	const end = await sr.settleOnFocus();
	expect(missing(end, endFacts), `${sr.name} announced "${end}"`).toEqual([]);
}

export async function readSliderTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.slider.slice(2)}`);
	const thumb = section.getByRole('slider');

	// Bounds are asserted on the element, not in a phrase: neither reader's wording
	// for a bound has been observed against our markup, and inventing one would
	// pass or fail for reasons that have nothing to do with the page.
	await expect(thumb).toHaveAttribute('aria-valuemin', String(RANGE_MIN));
	await expect(thumb).toHaveAttribute('aria-valuemax', String(RANGE_MAX));
	await expect(thumb).toHaveAttribute('aria-valuenow', String(RESTING));

	await thumb.focus();
	const resting = await sr.settleOnFocus();
	expect(
		missing(resting, [ROLE, NAME, String(RESTING)]),
		`${sr.name} announced "${resting}"`,
	).toEqual([]);

	await readRangeSection(sr, page);

	// Focus rather than the reading cursor: an arrow only steps the value once the
	// thumb is the focused control.
	await thumb.focus();
	await sr.settleOnFocus();

	await sr.press(sr.keys.arrowRight);
	await expect(thumb).toHaveAttribute('aria-valuenow', String(STEPPED_UP), {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expectAnnouncesAfterChange(sr, [ROLE, String(STEPPED_UP)]);

	await sr.press(sr.keys.arrowDown);
	await expect(thumb).toHaveAttribute('aria-valuenow', String(STEPPED_DOWN), {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expectAnnouncesAfterChange(sr, [ROLE, String(STEPPED_DOWN)]);
}
