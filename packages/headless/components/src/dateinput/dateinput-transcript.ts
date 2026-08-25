import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam, for the same reason
 * `./dateinput.sr.ts` keeps its own word table: `spinbutton` has no `Vocabulary`
 * slot, and a value or a bound is spoken as a phrase around a number whose
 * separators no real reader has been observed producing for our markup.
 * Containment in the whole phrase is what can be asserted honestly until a CI run
 * prints one.
 */

// The date input section is the last on the gallery page, so a walk that starts at
// the top of the document needs more steps than any other family's.
const WALK_LIMIT = 280;
const CHANGE_TIMEOUT_MS = 15_000;
const NAME = 'Start date';

// Both readers' documented role word for `role="spinbutton"` has never been
// observed against our markup, so the only fact asserted in a phrase is the
// accessible name each box carries.
const MONTH = 'month input';
const DAY = 'day input';
const YEAR = 'year input';

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

export async function readDateInputTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.dateinput.slice(2)}`);
	const boxes = section.getByRole('spinbutton');

	await expect(boxes).toHaveCount(3);

	// Bounds and the group's name are asserted on the elements, not in a phrase:
	// neither reader's wording for a bound has been observed against our markup,
	// and inventing one would pass or fail for reasons unrelated to the page.
	await expect(boxes.nth(0)).toHaveAccessibleName(MONTH);
	await expect(boxes.nth(1)).toHaveAccessibleName(DAY);
	await expect(boxes.nth(2)).toHaveAccessibleName(YEAR);
	await expect(boxes.nth(0)).toHaveAttribute('aria-valuemin', '1');
	await expect(boxes.nth(0)).toHaveAttribute('aria-valuemax', '12');
	await expect(boxes.nth(1)).toHaveAttribute('aria-valuemin', '1');
	await expect(boxes.nth(1)).toHaveAttribute('aria-valuemax', '31');
	await expect(section.getByRole('group')).toHaveAccessibleName(NAME);

	const resting = await readForPhrase(sr, [MONTH], WALK_LIMIT);
	expect(missing(resting, [MONTH]), `${sr.name} announced "${resting}"`).toEqual([]);

	// Focus rather than the reading cursor: an arrow only steps a box once it is
	// the focused control.
	await boxes.nth(0).focus();
	await sr.settleOnFocus();

	await sr.press(sr.keys.arrowDown);
	// An empty box starts from today, so the value is asserted as present rather
	// than as a number a run in any month would have to agree with.
	await expect(boxes.nth(0)).toHaveAttribute('aria-valuenow', /\d+/, {
		timeout: CHANGE_TIMEOUT_MS,
	});
}
