import { nvdaTest } from '@guidepup/playwright';
import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { missingFacts, readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';

// The gallery is one page of nine families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 140;
const CHANGE_TIMEOUT_MS = 15_000;

// Enter rather than an arrow: a real reader is in its own reading mode, and
// activating the item under the cursor is the one gesture that reaches the page
// in both readers' default mode.
async function readSelectTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.select.slice(2)}`);
	const combobox = section.getByRole('combobox');

	const collapsed = await readUntil(sr, { state: ['notExpanded'] }, WALK_LIMIT);
	expect(
		missingFacts(sr, collapsed, { name: 'Favorite Fruit', state: ['notExpanded'] }),
		`${sr.name} announced "${collapsed}"`,
	).toEqual([]);

	await sr.press(sr.keys.enter);
	await expect(combobox).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });

	// A closed listbox keeps its options out of the tree, so reaching all three by
	// name is the proof the popup opened for the reader and not only for the DOM.
	for (const option of ['Apple', 'Banana', 'Cherry']) {
		await readUntil(sr, { name: option }, WALK_LIMIT);
	}
}

nvdaTest('NVDA conveys the collapsed select and reaches its options once it opens', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.select}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readSelectTranscript(realDriver(nvda, nvdaSpec), page);
});
