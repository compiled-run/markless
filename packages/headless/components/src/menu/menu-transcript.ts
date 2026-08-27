import { expect, type Page } from '@playwright/test';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * Two facts this family needs have no word in the shared `Vocabulary` yet -
 * `menu` and `menuitem` - and that file belongs to the unit that registers the
 * family. Until it carries them, the roles are asserted from the page (which is
 * what a reader reads) and the reader is held to the name and the state, which
 * are the facts a menu's announcement actually turns on.
 */

// The menu section is not on the gallery page yet: adding it is the registration
// unit's, and this limit is sized for a section near the end of that page.
const WALK_LIMIT = 220;
const CHANGE_TIMEOUT_MS = 15_000;
const MENU_ANCHOR = '/#menu';
const TRIGGER = 'Actions';
const FIRST_ITEM = 'Cut';
const SECOND_ITEM = 'Copy';

/** The anchor the gallery section will carry. It moves to FAMILY_ANCHORS with the section itself. */
export const MENU_SECTION = MENU_ANCHOR;

const collapsedTrigger: Conveys = { role: 'button', name: TRIGGER, state: ['notExpanded'] };

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

export async function readMenuTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${MENU_ANCHOR.slice(2)}`);
	const trigger = section.getByRole('button', { name: TRIGGER });
	const surface = section.getByRole('menu');

	// Closed, the trigger is the whole message: a button, its name, and a surface that is not showing.
	expectConveys(sr, await readUntil(sr, collapsedTrigger, WALK_LIMIT), collapsedTrigger);
	await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

	await sr.press(sr.keys.enter);
	await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expect(surface).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });

	// The first item takes focus as the menu opens, so the reader follows the page rather than being walked.
	expectConveys(sr, await sr.settleOnFocus(), { name: FIRST_ITEM });
	await expect(section.getByRole('menuitem', { name: FIRST_ITEM })).toBeFocused();

	await sr.press(sr.keys.arrowDown);
	await expect(section.getByRole('menuitem', { name: SECOND_ITEM })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: SECOND_ITEM });

	// Escape takes the surface down and hands focus back, which the trigger's own state is what reports.
	await sr.press('Escape');
	await expect(surface).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(trigger).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, collapsedTrigger);
}
