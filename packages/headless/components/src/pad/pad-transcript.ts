import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is this family's central divergence.
 * `aria-valuenow` is one number and a pad holds two, so the second axis rides in
 * `aria-valuetext`. Three claims cannot be made in the virtual lane at all:
 * whether a real reader prefers that text over the number it would otherwise
 * read, whether it speaks the replacement role word from
 * `aria-roledescription`, and whether Tab really lands on each handle in turn.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 240;
const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Shadow offset';
const RESTING = 'X 0.25, Y 0.75';
const STEPPED = 'X 0.26';

/** Where the pad sits on the gallery page. */
export const PAD_ANCHOR = FAMILY_ANCHORS.pad;

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

export async function readPadTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${PAD_ANCHOR.slice(2)}`);
	const field = section.getByRole('group', { name: NAME });
	const handle = section.getByRole('slider', { name: NAME }).first();

	// One group named by the label, with a real focusable control inside it.
	await expect(field).toHaveCount(1);
	await expect(handle).toHaveAttribute('aria-roledescription', '2D slider');
	await expect(handle).toHaveAttribute('tabindex', '0');
	await expect(handle).toHaveAttribute('aria-valuetext', RESTING);

	// Both numbers at rest. This is the claim the design turns on: a reader that
	// read `aria-valuenow` alone would convey x and drop y entirely.
	const resting = await readForPhrase(sr, [NAME, RESTING], WALK_LIMIT);
	expect(missing(resting, [NAME, RESTING]), `${sr.name} announced "${resting}"`).toEqual([]);

	// A key moves the handle, and what a real reader says about the move is the
	// second claim: the announcement has to change, not merely the attribute.
	await handle.focus();
	await sr.settleOnFocus();
	await sr.press('ArrowRight');
	await expect(handle).toHaveAttribute('aria-valuetext', STEPPED, {
		timeout: CHANGE_TIMEOUT_MS,
	});

	const stepped = await readForPhrase(sr, [STEPPED], WALK_LIMIT);
	expect(missing(stepped, [STEPPED]), `${sr.name} announced "${stepped}"`).toEqual([]);

	// The grid is decoration on top of the field and never its own stop.
	await expect(section.locator('[ui-grid]')).toHaveAttribute('aria-hidden', 'true');
}
