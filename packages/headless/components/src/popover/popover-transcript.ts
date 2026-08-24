import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 */

// The popover section is the tenth of eleven on the gallery page, so a walk that
// starts at the top of the document needs more steps than the earlier families'.
const WALK_LIMIT = 200;
const CHANGE_TIMEOUT_MS = 15_000;
const TRIGGER = 'Share';
const TITLE = 'Share this page';

const collapsedTrigger: Conveys = {
	role: 'button',
	name: TRIGGER,
	state: ['notExpanded'],
};

const expandedTrigger: Conveys = {
	role: 'button',
	name: TRIGGER,
	state: ['expanded'],
};

// The surface reaches the DOM after the dispatch the press woke returns, and a
// real reader speaks on its own schedule on top of that, so the reader is asked
// again until the new state is what it reads.
async function expectAnnouncesAfterChange(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Open, close and open again before walking into the surface: the shared driver
// moves the reading cursor forward only, so every fact about the trigger has to
// be read while the cursor is still standing on it.
export async function readPopoverTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.popover.slice(2)}`);
	const trigger = section.getByRole('button', { name: TRIGGER });
	const surface = section.getByRole('dialog');

	expectConveys(sr, await readUntil(sr, collapsedTrigger, WALK_LIMIT), collapsedTrigger);

	await sr.press(sr.keys.enter);
	await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, expandedTrigger);

	await sr.press('Escape');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false', { timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, collapsedTrigger);

	await sr.press(sr.keys.enter);
	await expect(surface).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });

	// A closed surface is `hidden`, which takes the whole subtree out of the tree a
	// reader walks, so reaching the dialog by role and name is the proof it opened
	// for the reader and not only for the DOM.
	expectConveys(sr, await readUntil(sr, { role: 'dialog', name: TITLE }, WALK_LIMIT), {
		role: 'dialog',
		name: TITLE,
	});
}
