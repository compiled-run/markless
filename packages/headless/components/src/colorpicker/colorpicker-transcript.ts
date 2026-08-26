import { expect, type Page } from '@playwright/test';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam, for the same reason
 * `./slider.sr.ts` keeps its own word table: this family has no `Vocabulary` slot.
 * Its role has none, and a value arrives as `aria-valuetext`, which every reader
 * wraps in a phrase of its own. Containment in the whole phrase is what can be
 * asserted honestly until a CI run prints one.
 */

// The gallery has no colorpicker section yet, so the anchor is written here
// rather than imported from FAMILY_ANCHORS. Both lanes below skip themselves when
// the section is missing, so this file is honest on a gallery that has not caught
// up rather than red for a reason that is not the family's.
export const COLORPICKER_ANCHOR = '/#colorpicker';
export const COLORPICKER_ORIGIN = PREVIEW_ORIGIN;

const WALK_LIMIT = 300;
const CHANGE_TIMEOUT_MS = 15_000;

// Both readers' documented role word for `role="slider"`, and the only fact of a
// slider's announcement whose wording either one has on record.
const ROLE = 'slider';

// What the gallery section is expected to pin: one picker seeded to #3399FF, so
// what a reader hears is the same on every run.
const HUE = '210';
const SATURATION = '80';
const BRIGHTNESS = '100';
const COLOUR_NAME = 'vibrant cyan blue';
const HUE_NAME = 'cyan blue';
const STEPPED_SATURATION = '79';

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

/** True when the gallery carries a colorpicker section for these lanes to read. */
export async function hasColorpickerSection(page: Page): Promise<boolean> {
	return (await page.locator('#colorpicker').count()) > 0;
}

export async function readColorpickerTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator('#colorpicker');
	const area = section.getByRole('group').first();
	const axes = area.getByRole('slider');
	const hueThumb = section.locator('[ui-channel="hue"][role="slider"]');

	// The divergence this family exists to hold: one visual plane, two adjustable
	// controls. With one, a reader could move saturation and never brightness.
	await expect(axes).toHaveCount(2);
	await expect(axes.nth(0)).toHaveAttribute('aria-roledescription', '2D Slider');
	await expect(axes.nth(1)).toHaveAttribute('aria-roledescription', '2D Slider');
	await expect(axes.nth(0)).toHaveAccessibleName('Saturation');
	await expect(axes.nth(1)).toHaveAccessibleName('Brightness');
	await expect(axes.nth(0)).toHaveAttribute('aria-valuenow', SATURATION);
	await expect(axes.nth(1)).toHaveAttribute('aria-valuenow', BRIGHTNESS);

	// Bounds and the channel's own range are asserted on the element, not in a
	// phrase: neither reader's wording for a bound has been observed against our
	// markup, and inventing one would pass or fail for reasons that have nothing
	// to do with the page.
	await expect(hueThumb).toHaveAttribute('aria-valuemin', '0');
	await expect(hueThumb).toHaveAttribute('aria-valuemax', '360');
	await expect(hueThumb).toHaveAttribute('aria-valuenow', HUE);

	const restingFacts = [ROLE, 'Saturation', COLOUR_NAME];
	const resting = await readForPhrase(sr, restingFacts, WALK_LIMIT);
	expect(missing(resting, restingFacts), `${sr.name} announced "${resting}"`).toEqual([]);

	// The hue rail speaks the hue's own name and not the whole colour's.
	const hueFacts = [ROLE, 'Hue', HUE_NAME];
	const hue = await readForPhrase(sr, hueFacts, WALK_LIMIT);
	expect(missing(hue, hueFacts), `${sr.name} announced "${hue}"`).toEqual([]);

	// Focus rather than the reading cursor: an arrow only moves the plane once the
	// axis control is the focused control.
	await axes.nth(0).focus();
	await sr.settleOnFocus();

	await sr.press('ArrowLeft');
	await expect(axes.nth(0)).toHaveAttribute('aria-valuenow', STEPPED_SATURATION, {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expectAnnouncesAfterChange(sr, [`Saturation: ${STEPPED_SATURATION}%`]);

	// The other axis takes the focus and speaks for itself, which is the whole
	// point of there being two.
	await sr.press('ArrowDown');
	await expect(axes.nth(1)).toHaveAttribute('aria-valuenow', '99', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expectAnnouncesAfterChange(sr, ['Brightness: 99%']);
}
