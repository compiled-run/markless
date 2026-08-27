import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import type { ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are the facts an announcement must convey rather than any reader's
 * wording, so this file runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is this family's central divergence: there
 * is no APG pattern for a movable, resizable rectangle, so it ships as a
 * `role="group"` wearing `aria-roledescription="crop area"`, with eight
 * `role="slider"` handles and a live readout doing the work a text value would
 * do. Three claims cannot be made in the virtual lane at all — whether a real
 * reader speaks the roledescription in place of "group", whether it speaks a
 * handle's value when an arrow key moves an edge, and whether the live readout is
 * heard when the rectangle moves under it.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 240;
const CHANGE_TIMEOUT_MS = 15_000;

const NAME = 'Crop';
const ROLE_DESCRIPTION = 'crop area';
const AT_REST = '40, 30, 200×150';
const AFTER_NUDGE = '50, 30, 200×150';

/** Where the crop sits on the gallery page. */
export const CROP_ANCHOR = FAMILY_ANCHORS.crop;

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

export async function readCropTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${CROP_ANCHOR.slice(2)}`);
	const rectangle = section.getByRole('group', { name: NAME });

	await expect(rectangle).toHaveCount(1);
	await expect(rectangle).toHaveAttribute('tabindex', '0');
	await expect(rectangle).toHaveAttribute('aria-roledescription', ROLE_DESCRIPTION);

	// The section serves one crop, and the readout is reached through what the
	// rectangle is described by rather than by picking an output off the page.
	// The rectangle names its error, then its description, then the readout.
	const describedBy = (await rectangle.getAttribute('aria-describedby')) ?? '';
	const readoutId = describedBy.split(/\s+/).filter(Boolean).at(-1);
	if (!readoutId) throw new Error('The rectangle is described by nothing, so it has no readout.');
	const described = page.locator(`[id="${readoutId}"]`);
	await expect(described).toHaveText(AT_REST);

	// The first claim: the roledescription is spoken instead of "group". Nothing
	// in the virtual lane can tell us whether a shipping reader honours it.
	const resting = await readForPhrase(sr, [NAME, ROLE_DESCRIPTION], WALK_LIMIT);
	expect(missing(resting, [NAME, ROLE_DESCRIPTION]), `${sr.name} announced "${resting}"`).toEqual(
		[],
	);

	// Eight handles, each its own slider with its own name and a value.
	const handles = section.getByRole('slider');
	await expect(handles).toHaveCount(8);
	const farEdge = section.getByRole('slider', { name: 'End edge' });
	await expect(farEdge).toHaveAttribute('aria-valuenow', '240');

	// The second claim: a handle's value as a real reader speaks it when the edge
	// moves. `slider` is the one role here every reader already knows how to read.
	await farEdge.focus();
	await sr.settleOnFocus();
	const onArrival = await readForPhrase(sr, ['240'], WALK_LIMIT);
	expect(missing(onArrival, ['240']), `${sr.name} announced "${onArrival}"`).toEqual([]);
	await sr.press('ArrowRight');
	await expect(farEdge).toHaveAttribute('aria-valuenow', '241', { timeout: CHANGE_TIMEOUT_MS });

	// The third claim: the live readout is the only thing on the page that says
	// the rectangle moved, so this is whether that announcement is heard at all.
	await rectangle.focus();
	await sr.settleOnFocus();
	await sr.press('Shift+ArrowRight');
	await expect(described).toHaveText(AFTER_NUDGE, { timeout: CHANGE_TIMEOUT_MS });

	// The grid inside the rectangle is decoration and is never its own stop.
	await expect(section.locator('[ui-grid]').first()).toHaveAttribute('aria-hidden', 'true');
}
