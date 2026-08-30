import { expect, type Page } from '@playwright/test';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * what a shipping reader does when its review cursor crosses a
 * `contenteditable="false"` island inside a textbox. The virtual lane can prove
 * the island carries no role and no tab stop; only NVDA and VoiceOver can say
 * whether the label is spoken as part of the line, skipped, or announced as some
 * embedded-object placeholder — and that last case would be a real defect, since
 * a person would then hear a mention field with the names missing.
 */

const FIELD = 'Draft';
const FIRST_TOKEN = 'Alice Chen';

/**
 * Where the box sits on the gallery page.
 *
 * A literal because registration is a follow-up unit: swap this for
 * `FAMILY_ANCHORS.tokenbox` (imported from `packages/headless/sr-app/preview-server.ts`,
 * the way every registered family's transcript does it) the moment the anchor is
 * added, and delete this comment with it.
 */
export const TOKENBOX_ANCHOR = '/#tokenbox';

export async function readTokenBoxTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TOKENBOX_ANCHOR.slice(2)}`);
	const box = section.getByRole('textbox', { name: FIELD });

	await expect(box).toHaveCount(1);
	await expect(box).toHaveAttribute('contenteditable', 'true');
	await expect(box).toHaveAttribute('aria-multiline', 'false');

	// Settled from the markup first, so a silent reader and a broken family cannot
	// be confused for one another: the tokens are in the box, they carry no role,
	// and their labels are their text.
	const tokens = section.locator('[ui-token]');
	await expect(tokens.first()).toHaveText(FIRST_TOKEN);
	await expect(tokens.first()).toHaveAttribute('contenteditable', 'false');
	await expect(section.locator('[ui-token][role]')).toHaveCount(0);

	// The box is one control, so the walk finds a textbox rather than a run of
	// per-token stops.
	await readUntil(sr, { role: 'textbox', name: FIELD }, GALLERY_WALK_LIMIT);

	// The claim only a real reader can settle: the token's label reaches a person
	// when the cursor is inside the field. Read from the box itself rather than
	// from the walk, because a review cursor enters a textbox by a route the
	// container walk does not take.
	await box.focus();
	await sr.settleOnFocus();
	const inside = await readUntil(sr, { name: FIRST_TOKEN }, GALLERY_WALK_LIMIT);
	expect(inside, `${sr.name} never spoke the token's label from inside the box`).toContain(
		FIRST_TOKEN,
	);
}
