import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * that a surface a swipe can move is still an ordinary dialog to a reader, and
 * that the rest position it happens to be at changes nothing it announces.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const TRIGGER = 'Filter results';
const TITLE = 'Narrow these results';

/** Where the drawer sits on the gallery page. */
export const DRAWER_ANCHOR = FAMILY_ANCHORS.drawer;

// Opening reshapes the tree rather than flipping an attribute, so every step here
// walks forward; re-reading in place would land somewhere else entirely.
export async function readDrawerTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${DRAWER_ANCHOR.slice(2)}`);
	const dialog = section.getByRole('dialog');

	await readUntil(sr, { role: 'button', name: TRIGGER }, GALLERY_WALK_LIMIT);

	// A closed drawer sits behind a hidden backdrop, which takes the whole subtree
	// out of the tree a reader walks.
	await expect(dialog).toBeHidden();

	await sr.press(sr.keys.enter);
	await expect(dialog).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });

	// Named, not merely a dialog: modal, popover and tour serve one, this section four.
	await readUntil(sr, { role: 'dialog', name: TITLE }, GALLERY_WALK_LIMIT);
}
