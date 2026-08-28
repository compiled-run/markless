import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam, for the reason
 * `datebox-transcript.ts` records: `spinbutton` has no `Vocabulary` slot, and a
 * value or a bound is spoken as a phrase around a number rather than as a fixed
 * word. What a real reader is here to settle is narrower than the virtual lane's
 * rows: that a segmented group is reachable at all, and that the AM/PM box - the
 * one carrying `aria-valuetext` - speaks its words rather than a bare 0 or 1.
 */

const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Start time';
const HOUR = 'hour input';
const PERIOD = 'AM or PM';

/** Where the empty starter sits on the gallery page. */
export const TIMEBOX_ANCHOR = FAMILY_ANCHORS.timebox;

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

export async function readTimeBoxTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TIMEBOX_ANCHOR.slice(2)}`);
	const group = section.getByRole('group', { name: NAME });
	const hour = section.getByRole('spinbutton', { name: HOUR });
	const period = section.getByRole('spinbutton', { name: PERIOD });

	// Every box is a real tab stop rather than one roving stop, which is this
	// family's central keyboard claim and `datebox`'s ruling before it.
	await expect(group).toHaveCount(1);
	await expect(hour).toHaveAttribute('tabindex', '0');
	await expect(period).toHaveAttribute('tabindex', '0');

	const resting = await readForPhrase(sr, [NAME], GALLERY_WALK_LIMIT);
	expect(missing(resting, [NAME]), `${sr.name} announced "${resting}"`).toEqual([]);

	// Focus rather than the reading cursor: an arrow only steps a box once it is
	// the focused control.
	await hour.focus();
	await sr.settleOnFocus();

	// The gallery starter is empty, so the first step lands on the placeholder
	// value a 12-hour clock starts from.
	await sr.press(sr.keys.arrowDown);
	await expect(hour).toHaveText('12', { timeout: CHANGE_TIMEOUT_MS });
	await expect(hour).toHaveAttribute('aria-valuenow', '12', { timeout: CHANGE_TIMEOUT_MS });

	// The claim a real reader is here to settle: the period box's number means
	// nothing on its own, so it renders `aria-valuetext` and the reader is
	// expected to speak those words in the number's place.
	// `Keys` carries no arrow-up name, so the walk steps down; two values wrapped
	// is a toggle, so either direction lands on the other half of the day.
	await period.focus();
	await sr.settleOnFocus();
	await sr.press(sr.keys.arrowDown);
	await expect(period).toHaveAttribute('aria-valuetext', 'AM', { timeout: CHANGE_TIMEOUT_MS });

	const spoken = await readForPhrase(sr, ['AM'], GALLERY_WALK_LIMIT);
	expect(missing(spoken, ['AM']), `${sr.name} announced "${spoken}"`).toEqual([]);
}
