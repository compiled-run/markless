import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
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

// The slider section is the last of eleven on the gallery page, so a walk that
// starts at the top of the document needs more steps than any other family's.
const WALK_LIMIT = 220;
const CHANGE_TIMEOUT_MS = 15_000;
const NAME = 'Volume';

// Both readers' documented role word for `role="slider"`, and the only slider
// fact whose wording either one has on record.
const ROLE = 'slider';

// The thumb carries `aria-valuetext` as the bare number, so the value a reader
// speaks is that number however it wraps it.
const RESTING = 40;
const STEPPED_UP = 41;
const STEPPED_DOWN = 40;

function missing(phrase: string, facts: readonly string[]): string[] {
	return facts.filter((fact) => !phrase.includes(fact));
}

async function readForPhrase(
	sr: ScreenReaderDriver,
	facts: readonly string[],
	limit: number,
): Promise<string> {
	const seen: string[] = [];
	let phrase = await sr.lastSpokenPhrase();
	for (let step = 0; step <= limit; step++) {
		seen.push(phrase);
		if (missing(phrase, facts).length === 0) return phrase;
		await sr.next();
		phrase = await sr.lastSpokenPhrase();
	}
	throw new Error(
		`${sr.name} never announced ${JSON.stringify(facts)} in ${limit} steps.\n` +
			`Transcript: ${JSON.stringify(seen, null, 1)}`,
	);
}

// A step reaches the DOM after the dispatch the keystroke woke returns, and a
// real reader speaks on its own schedule on top of that, so the reader is asked
// again until the new value is what it reads.
async function expectAnnouncesAfterChange(sr: ScreenReaderDriver, facts: readonly string[]) {
	await expect
		.poll(async () => missing(await sr.reannounce(), facts), { timeout: CHANGE_TIMEOUT_MS })
		.toEqual([]);
}

// The gallery serves one single-value slider, so the two thumbs of a range - which
// share one accessible name and are told apart only by value and crossed bounds -
// have no section here to be read in.
export async function readSliderTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.slider.slice(2)}`);
	const thumb = section.getByRole('slider');

	// Bounds are asserted on the element, not in a phrase: neither reader's wording
	// for a bound has been observed against our markup, and inventing one would
	// pass or fail for reasons that have nothing to do with the page.
	await expect(thumb).toHaveAttribute('aria-valuemin', '0');
	await expect(thumb).toHaveAttribute('aria-valuemax', '100');
	await expect(thumb).toHaveAttribute('aria-valuenow', String(RESTING));

	const resting = await readForPhrase(sr, [ROLE, NAME, String(RESTING)], WALK_LIMIT);
	expect(
		missing(resting, [ROLE, NAME, String(RESTING)]),
		`${sr.name} announced "${resting}"`,
	).toEqual([]);

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
