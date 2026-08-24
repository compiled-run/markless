import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 */

// The gallery is one page of nine families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 140;
const CHANGE_TIMEOUT_MS = 15_000;
const TITLE = 'Edit delivery address';

// Opening reshapes the tree rather than flipping an attribute, so every step
// here walks forward; re-reading in place would land somewhere else entirely.
export async function readModalTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.modal.slice(2)}`);
	const dialog = section.getByRole('dialog');

	await readUntil(sr, { name: 'Edit address' }, WALK_LIMIT);

	// A closed dialog sits behind a hidden backdrop, which takes the whole subtree
	// out of the tree a reader walks.
	await expect(dialog).toBeHidden();

	await sr.press(sr.keys.enter);
	await expect(dialog).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });

	await readUntil(sr, { role: 'dialog' }, WALK_LIMIT);
	await readUntil(sr, { name: TITLE }, WALK_LIMIT);
}
