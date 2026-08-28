import { expect, type Page } from '@playwright/test';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * that a chip row carrying no collection role is still navigable, and that the
 * tag's own words reach a person through the delete button's name.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 200;
const FIELD = 'Topics';
const FIRST_TAG = 'Remove alpha';

/**
 * Where the taglist sits on the gallery page.
 *
 * Spelled here rather than imported from `FAMILY_ANCHORS` because registration is
 * a follow-up unit and the gallery has no `taglist` key yet. That unit moves this
 * constant into `apps/sr-gallery/preview-server.ts` and imports it back.
 */
export const TAGLIST_ANCHOR = '/#taglist';

export async function readTagListTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TAGLIST_ANCHOR.slice(2)}`);

	await readUntil(sr, { role: 'button', name: FIRST_TAG }, WALK_LIMIT);
	await readUntil(sr, { role: 'textbox', name: FIELD }, WALK_LIMIT);

	// The live region is the family's guarantee that a removal is spoken, so the
	// real lane checks it is in the tree rather than trusting the virtual reader.
	await expect(section.locator('output[aria-live]')).toHaveCount(1);
}
