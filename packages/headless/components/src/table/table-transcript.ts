import { expect, type Page } from '@playwright/test';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are the facts an announcement must convey rather than any
 * reader's wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam for the reason
 * `gridlist-transcript.ts` records for its own: `grid`, `row`, `gridcell` and
 * `rowheader` have no `Vocabulary` slot. What a real reader is here to settle is
 * narrower than the virtual lane's rows: that the grid is reachable, that a cell
 * is a real focus stop in two directions, and that picking a row is conveyed as
 * a state on the row rather than on the cell the keystroke arrived at.
 */

const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Files';
const FIRST = 'README.md';
const SECOND = 'LICENSE';

/**
 * Where the starter sits on the gallery page. A literal, because this family is
 * not registered yet: every registered family reads `FAMILY_ANCHORS`, and the
 * registration unit swaps this line for that read.
 */
export const TABLE_ANCHOR = '/#table';

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

export async function readTableTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TABLE_ANCHOR.slice(2)}`);
	const grid = section.getByRole('grid', { name: NAME });
	const firstRow = section.getByRole('row').first();
	const firstCell = section.getByRole('rowheader').first();

	await expect(grid).toHaveCount(1);
	// One tab stop for the whole table until focus is inside it, and the cells are
	// reached with the arrows from there - this family's central keyboard claim.
	await expect(grid).toHaveAttribute('tabindex', '0');
	await expect(firstCell).toHaveAttribute('tabindex', '-1');

	const resting = await readForPhrase(sr, [NAME], GALLERY_WALK_LIMIT);
	expect(missing(resting, [NAME]), `${sr.name} announced "${resting}"`).toEqual([]);

	// The row header is what names a row for a reader, which is why it is a part
	// rather than the consumer's own markup.
	const named = await readForPhrase(sr, [FIRST], GALLERY_WALK_LIMIT);
	expect(missing(named, [FIRST]), `${sr.name} announced "${named}"`).toEqual([]);

	// Focus rather than the reading cursor: the space bar only picks a row once a
	// cell of that row is the focused element.
	await firstCell.focus();
	await sr.settleOnFocus();
	await expect(grid).toHaveAttribute('tabindex', '-1', { timeout: CHANGE_TIMEOUT_MS });
	await expect(firstCell).toHaveAttribute('tabindex', '0', { timeout: CHANGE_TIMEOUT_MS });

	await sr.press(sr.keys.space);
	await expect(firstRow).toHaveAttribute('aria-selected', 'true', { timeout: CHANGE_TIMEOUT_MS });

	const picked = await readForPhrase(sr, [FIRST], GALLERY_WALK_LIMIT);
	expect(missing(picked, [FIRST]), `${sr.name} announced "${picked}"`).toEqual([]);

	// The second axis, heard: an arrow down stays in its column and arrives in the
	// next row, which is the move a reader's own table navigation has to agree with.
	await sr.press(sr.keys.arrowDown);
	const walked = await readForPhrase(sr, [SECOND], GALLERY_WALK_LIMIT);
	expect(missing(walked, [SECOND]), `${sr.name} announced "${walked}"`).toEqual([]);
}
