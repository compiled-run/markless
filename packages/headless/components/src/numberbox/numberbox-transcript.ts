import { expect, type Page } from '@playwright/test';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It reads raw phrases rather than the shared `Conveys` seam, for the same reason
 * `./numberbox.sr.ts` keeps its own word table: this family carries no `role`, so
 * there is no `Vocabulary` slot to ask for. What a reader speaks in the role's
 * place is the `aria-roledescription` string, which both readers are documented
 * to speak verbatim - and that string is the one claim a real reader is here to
 * settle, because dropping `role="spinbutton"` is this family's central divergence
 * from the APG.
 *
 * Not asserted in a phrase: the range. It reaches a reader only through the
 * consumer's `description`, and the starter the gallery mounts has none - the
 * bounded scenario is where that row lives, in the virtual lane.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 200;
const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Quantity';
const ROLE_DESCRIPTION = 'number field';
const DECREASE = 'Decrease';
const INCREASE = 'Increase';
// U+2212, not a hyphen: the sign a reader is meant to speak.
const MINUS_ONE = '\u22121';

/**
 * Where the numberbox sits on the gallery page. Spelled here rather than read
 * from `FAMILY_ANCHORS`, because the gallery section this walk needs lands with
 * the gallery registration and this file ships before it.
 */
export const NUMBERBOX_ANCHOR = '/#numberbox';

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

export async function readNumberboxTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${NUMBERBOX_ANCHOR.slice(2)}`);
	const field = section.getByRole('textbox', { name: NAME });

	// The control is a real text box with no role of its own, which is the whole
	// claim: a spinbutton here could not be focused with VoiceOver at all.
	await expect(field).toHaveCount(1);
	await expect(field).toHaveAttribute('aria-roledescription', ROLE_DESCRIPTION);
	await expect(field).not.toHaveAttribute('role', /.*/);

	// The two step buttons are named and out of the tab order, and each points at
	// the field it moves - the only thing telling a reader they are one control.
	const back = section.getByRole('button', { name: DECREASE });
	const forward = section.getByRole('button', { name: INCREASE });
	await expect(back).toHaveAttribute('tabindex', '-1');
	await expect(forward).toHaveAttribute('tabindex', '-1');
	const fieldId = await field.getAttribute('id');
	await expect(back).toHaveAttribute('aria-controls', fieldId ?? '');

	const resting = await readForPhrase(sr, [ROLE_DESCRIPTION, NAME], WALK_LIMIT);
	expect(missing(resting, [ROLE_DESCRIPTION, NAME]), `${sr.name} announced "${resting}"`).toEqual(
		[],
	);

	// Focus rather than the reading cursor: an arrow only steps the field once it
	// is the focused control.
	await field.focus();
	await sr.settleOnFocus();

	// The starter is unbounded and starts empty, so the first press seeds from
	// zero. `Keys` carries no arrow-up name, so the walk steps down; the number is
	// asserted on the element as well as read, because a reader's phrasing around
	// a bare digit has never been observed for our markup.
	await sr.press(sr.keys.arrowDown);
	await expect(field).toHaveValue('0', { timeout: CHANGE_TIMEOUT_MS });
	await sr.press(sr.keys.arrowDown);
	await expect(field).toHaveValue('-1', { timeout: CHANGE_TIMEOUT_MS });

	// The root renders one always-present live region, and a stepped number is
	// written into it with U+2212 in place of the hyphen - without which VoiceOver
	// speaks no sign at all. This is the assertion a real reader is here to settle:
	// whether that announcement is heard, and whether the minus is in it.
	const region = section.locator('output[aria-live]');
	await expect(region).toHaveText(MINUS_ONE, { timeout: CHANGE_TIMEOUT_MS });
}
