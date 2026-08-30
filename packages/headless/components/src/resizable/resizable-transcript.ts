import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../sr-app/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any
 * reader's wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is this family's central bet: that a
 * focusable `role="separator"` carrying `aria-valuenow` is announced as a
 * splitter with a value a person can act on. Three claims cannot be made in the
 * virtual lane at all — whether a shipping reader names the role at all, whether
 * it speaks the new value when an arrow key moves the boundary, and whether
 * `aria-controls` makes the primary panel reachable from the divider.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 240;
const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Resize navigation';
const AT_REST = '30';
const AFTER_STEP = '31';

/** Where the panels sit on the gallery page. */
export const RESIZABLE_ANCHOR = FAMILY_ANCHORS.resizable;

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

export async function readResizableTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${RESIZABLE_ANCHOR.slice(2)}`);
	const divider = section.getByRole('separator', { name: NAME });

	await expect(divider).toHaveCount(1);
	await expect(divider).toHaveAttribute('tabindex', '0');
	// A side-by-side group is parted by a vertical splitter.
	await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
	await expect(divider).toHaveAttribute('aria-valuenow', AT_REST);

	// The third claim, settled from the markup: aria-controls names the primary
	// panel, and that panel is on the page under exactly that id.
	const controls = (await divider.getAttribute('aria-controls')) ?? '';
	if (!controls) throw new Error('The divider controls nothing, so it names no primary panel.');
	const primary = page.locator(`[id="${controls}"]`);
	await expect(primary).toHaveAttribute('ui-panel', '');

	// The first claim: what a shipping reader calls a focusable separator. Nothing
	// in the virtual lane can tell us whether it says "splitter", "separator" or
	// nothing at all, so the walk asks only for the name and the value it carries.
	const resting = await readForPhrase(sr, [NAME], WALK_LIMIT);
	expect(missing(resting, [NAME]), `${sr.name} announced "${resting}"`).toEqual([]);

	// The second claim: the value as a real reader speaks it once an arrow key has
	// moved the boundary. The DOM change is asserted first so a silent reader and
	// a broken family cannot be confused for one another.
	await divider.focus();
	await sr.settleOnFocus();
	await sr.press('ArrowRight');
	await expect(divider).toHaveAttribute('aria-valuenow', AFTER_STEP, {
		timeout: CHANGE_TIMEOUT_MS,
	});
	const afterStep = await readForPhrase(sr, [AFTER_STEP], WALK_LIMIT);
	expect(missing(afterStep, [AFTER_STEP]), `${sr.name} announced "${afterStep}"`).toEqual([]);
}
