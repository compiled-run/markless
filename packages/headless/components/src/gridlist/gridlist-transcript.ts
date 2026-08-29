import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are the facts an announcement must convey rather than any
 * reader's wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam for the reason
 * `timebox-transcript.ts` records for its own: `grid`, `row` and `gridcell` have
 * no `Vocabulary` slot, because no family before this one has shipped them. What
 * a real reader is here to settle is narrower than the virtual lane's rows: that
 * a grid of rows is reachable at all, that a row is a real focus stop, and that
 * picking one is conveyed as a state on the row rather than on the mark beside it.
 */

const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Files';
const FIRST = 'README.md';

/** Where the starter sits on the gallery page. */
export const GRIDLIST_ANCHOR = FAMILY_ANCHORS.gridlist;

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

export async function readGridListTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${GRIDLIST_ANCHOR.slice(2)}`);
	const grid = section.getByRole('grid', { name: NAME });
	const first = section.getByRole('row').first();

	await expect(grid).toHaveCount(1);
	// One tab stop for the whole list until focus is inside it, and the rows are
	// reached with the arrows from there - this family's central keyboard claim.
	await expect(grid).toHaveAttribute('tabindex', '0');
	await expect(first).toHaveAttribute('tabindex', '-1');

	const resting = await readForPhrase(sr, [NAME], GALLERY_WALK_LIMIT);
	expect(missing(resting, [NAME]), `${sr.name} announced "${resting}"`).toEqual([]);

	const named = await readForPhrase(sr, [FIRST], GALLERY_WALK_LIMIT);
	expect(missing(named, [FIRST]), `${sr.name} announced "${named}"`).toEqual([]);

	// Focus rather than the reading cursor: the space bar only picks a row once
	// that row is the focused element.
	await first.focus();
	await sr.settleOnFocus();
	await expect(grid).toHaveAttribute('tabindex', '-1', { timeout: CHANGE_TIMEOUT_MS });
	await expect(first).toHaveAttribute('tabindex', '0', { timeout: CHANGE_TIMEOUT_MS });

	// The claim a real reader is here to settle: picked is a state on the row, so
	// the mark a consumer paints beside it stays out of the announcement.
	await sr.press(sr.keys.space);
	await expect(first).toHaveAttribute('aria-selected', 'true', { timeout: CHANGE_TIMEOUT_MS });

	const picked = await readForPhrase(sr, [FIRST], GALLERY_WALK_LIMIT);
	expect(missing(picked, [FIRST]), `${sr.name} announced "${picked}"`).toEqual([]);
}
