import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../sr-app/preview-server.ts';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 */

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

export async function readTabsTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.tabs.slice(2)}`);
	const usageTab = section.getByRole('tab', { name: 'Usage' });

	await readUntil(sr, { role: 'tablist' }, GALLERY_WALK_LIMIT);

	const overview = await readUntil(sr, { role: 'tab', name: 'Overview' }, GALLERY_WALK_LIMIT);
	expect(
		missingFacts(sr, overview, { role: 'tab', name: 'Overview', state: ['selected'] }),
		`${sr.name} announced "${overview}"`,
	).toEqual([]);

	// Asserted as an absence: "not selected" is a state only some readers speak, so there is no word to assert.
	const usage = await readUntil(sr, { role: 'tab', name: 'Usage' }, GALLERY_WALK_LIMIT);
	const usageSelected = missingFacts(sr, usage, { state: ['selected'] });
	expect(usageSelected, `${sr.name} announced "${usage}"`).not.toEqual([]);

	await sr.press(sr.keys.enter);
	await expect(usageTab).toHaveAttribute('aria-selected', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, { role: 'tab', name: 'Usage', state: ['selected'] });

	// The panel that was hidden a moment ago is the one the reader now reaches.
	await readUntil(sr, { role: 'tabpanel' }, GALLERY_WALK_LIMIT);
	await readUntil(sr, { name: USAGE_PANEL_TEXT }, GALLERY_WALK_LIMIT);
}
