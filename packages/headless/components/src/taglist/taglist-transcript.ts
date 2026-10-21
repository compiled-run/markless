import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../sr-app/preview-server.ts';
import { missingFacts, readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * that a chip row carrying no collection role is still navigable, and that the
 * tag's own words reach a person through the delete button's name.
 */

const FIELD = 'Topics';
const FIRST_TAG = 'Remove alpha';

export async function readTagListTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.taglist.slice(2)}`);

	await readUntil(sr, { role: 'button', name: FIRST_TAG }, GALLERY_WALK_LIMIT);

	// The field on focus: NVDA's browse mode reads its placeholder and leaves the group's label to the line above.
	await section.getByRole('textbox', { name: FIELD }).first().focus();
	const field = await sr.settleOnFocus();
	expect(
		missingFacts(sr, field, { role: 'textbox', name: FIELD }),
		`${sr.name} announced "${field}"`,
	).toEqual([]);

	// The live region is the family's guarantee that a removal is spoken, so the
	// real lane checks it is in the tree rather than trusting the virtual reader.
	// One per root, and the gallery section serves three shapes.
	await expect(section.locator('output[aria-live]')).toHaveCount(3);
}
