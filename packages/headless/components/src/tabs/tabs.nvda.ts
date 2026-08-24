import { nvdaTest } from '@guidepup/playwright';
import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';

// The gallery is one page of nine families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 140;
const CHANGE_TIMEOUT_MS = 15_000;
const USAGE_PANEL_TEXT = 'How much of the plan you have used.';

// Showing a tab swaps a panel further down the page but leaves the tab itself
// where it was, so re-reading in place is the right move for this one item.
async function expectAnnouncesAfterChange(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

async function readTabsTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.tabs.slice(2)}`);
	const usageTab = section.getByRole('tab', { name: 'Usage' });

	await readUntil(sr, { role: 'tablist' }, WALK_LIMIT);

	const overview = await readUntil(sr, { role: 'tab', name: 'Overview' }, WALK_LIMIT);
	expect(
		missingFacts(sr, overview, { role: 'tab', name: 'Overview', state: ['selected'] }),
		`${sr.name} announced "${overview}"`,
	).toEqual([]);

	// Asserted as an absence: "not selected" is a state only some readers speak, so there is no word to assert.
	const usage = await readUntil(sr, { role: 'tab', name: 'Usage' }, WALK_LIMIT);
	const usageSelected = missingFacts(sr, usage, { state: ['selected'] });
	expect(usageSelected, `${sr.name} announced "${usage}"`).not.toEqual([]);

	await sr.press(sr.keys.enter);
	await expect(usageTab).toHaveAttribute('aria-selected', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, { role: 'tab', name: 'Usage', state: ['selected'] });

	// The panel that was hidden a moment ago is the one the reader now reaches.
	await readUntil(sr, { role: 'tabpanel' }, WALK_LIMIT);
	await readUntil(sr, { name: USAGE_PANEL_TEXT }, WALK_LIMIT);
}

nvdaTest('NVDA conveys the tab list and follows it through a tab change', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.tabs}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readTabsTranscript(realDriver(nvda, nvdaSpec), page);
});
