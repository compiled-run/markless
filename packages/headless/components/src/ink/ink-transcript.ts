import { expect, type Page } from '@playwright/test';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is this family's central divergence: a
 * drawing surface has no text and no keyboard way to draw, so it ships as one
 * `role="img"` named by the label, with a live stroke count doing the work an
 * editable control's value would do. Two claims cannot be made in the virtual
 * lane at all — whether a real reader speaks the count when it changes, and
 * whether it walks into the strokes inside the image.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 200;
const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Drawing';
const EMPTY = 'Empty';
const ONE_STROKE = '1 stroke';

/**
 * Where the drawing sits on the gallery page. Spelled here rather than read from
 * `FAMILY_ANCHORS`, because the gallery section this walk needs lands with the
 * gallery registration and this file ships before it.
 */
export const INK_ANCHOR = '/#ink';

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

export async function readInkTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${INK_ANCHOR.slice(2)}`);
	const area = section.getByRole('img', { name: NAME });

	// One graphic, named by the label, and a tab stop even though there is nothing
	// to type into it: that is the whole exposure.
	await expect(area).toHaveCount(1);
	await expect(area).toHaveAttribute('tabindex', '0');

	const described = section.locator('output[aria-live]');
	await expect(described).toHaveText(EMPTY);

	const resting = await readForPhrase(sr, [NAME], WALK_LIMIT);
	expect(missing(resting, [NAME]), `${sr.name} announced "${resting}"`).toEqual([]);

	// A stroke drawn with the pointer. Neither reader can draw one, so the gesture
	// is the page's, and what is asserted is what the reader says about it.
	const box = await area.boundingBox();
	if (!box) throw new Error('The drawing area has no box on the gallery page.');
	await page.mouse.move(box.x + 20, box.y + 20);
	await page.mouse.down();
	for (let step = 1; step <= 12; step++) {
		await page.mouse.move(box.x + 20 + step * 8, box.y + 20 + step * 4);
	}
	await page.mouse.up();

	// The live region is the only thing on the page that says a stroke landed.
	// This is the assertion a real reader is here to settle: whether that
	// announcement is heard at all when the surface itself never changes name.
	await expect(described).toHaveText(ONE_STROKE, { timeout: CHANGE_TIMEOUT_MS });

	// Undo is on the surface's own keys, because there is no other keyboard route
	// into a drawing.
	await area.focus();
	await sr.settleOnFocus();
	await sr.press('Control+z');
	await expect(described).toHaveText(EMPTY, { timeout: CHANGE_TIMEOUT_MS });

	// Nothing inside the graphic is its own stop: the strokes are presentational
	// under `role="img"`, and the guide line is `aria-hidden` on top of that.
	await expect(section.locator('[ui-guide]')).toHaveAttribute('aria-hidden', 'true');
}
