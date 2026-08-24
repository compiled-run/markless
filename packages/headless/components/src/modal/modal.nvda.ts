import { nvdaTest } from '@guidepup/playwright';
import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';

// The gallery is one page of nine families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 140;
const CHANGE_TIMEOUT_MS = 15_000;
const TITLE = 'Edit delivery address';

// Opening reshapes the tree rather than flipping an attribute, so every step
// here walks forward; re-reading in place would land somewhere else entirely.
async function readModalTranscript(sr: ScreenReaderDriver, page: Page) {
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

nvdaTest('NVDA reaches the dialog only once its trigger has opened it', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.modal}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readModalTranscript(realDriver(nvda, nvdaSpec), page);
});
