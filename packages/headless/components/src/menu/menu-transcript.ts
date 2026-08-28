import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
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
 *
 * Two facts this family needs have no word in the shared `Vocabulary` yet -
 * `menu` and `menuitem` - and that file belongs to the unit that registers the
 * family. Until it carries them, the roles are asserted from the page (which is
 * what a reader reads) and the reader is held to the name and the state, which
 * are the facts a menu's announcement actually turns on.
 *
 * The submenu walk is the recursive shape: the nesting item is a `menuitem` that
 * also reports a popup and whether it is open, the surface it opens is a `menu`
 * named by that item, and Escape steps out one level onto the item again.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const MENU_ANCHOR = FAMILY_ANCHORS.menu;
const TRIGGER = 'Actions';
const FIRST_ITEM = 'Cut';
const SECOND_ITEM = 'Copy';
/** The item that holds a submenu, and the first command inside it. */
const NESTING_ITEM = 'Share';
const SUBMENU_ITEM = 'Email';

export const MENU_SECTION = MENU_ANCHOR;
const collapsedTrigger: Conveys = { role: 'button', name: TRIGGER, state: ['notExpanded'] };
const collapsedNestingItem: Conveys = { name: NESTING_ITEM, state: ['notExpanded'] };

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
	const surface = section.getByRole('menu', { name: TRIGGER });

	// Closed, the trigger is the whole message: a button, its name, and a surface that is not showing.
	expectConveys(sr, await readUntil(sr, collapsedTrigger, GALLERY_WALK_LIMIT), collapsedTrigger);
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

	// The nesting item is still a menu item, and it says a menu is there before it is opened.
	const nesting = section.getByRole('menuitem', { name: NESTING_ITEM });
	expectConveys(sr, await readUntil(sr, collapsedNestingItem, GALLERY_WALK_LIMIT), collapsedNestingItem);
	await expect(nesting).toHaveAttribute('aria-haspopup', 'menu');

	// ArrowRight opens the submenu on its first command, and the item flips to expanded.
	const submenu = section.getByRole('menu', { name: NESTING_ITEM });
	await sr.press(sr.keys.arrowRight);
	await expect(nesting).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expect(submenu).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(submenu.getByRole('menuitem', { name: SUBMENU_ITEM })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: SUBMENU_ITEM });

	// Escape steps out ONE level: the submenu goes, focus is back on the item that opened it, and the menu above it stays up.
	await sr.press('Escape');
	await expect(submenu).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(nesting).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expect(surface).toBeVisible();
	await expectAnnouncesAfterChange(sr, collapsedNestingItem);

	// The next Escape takes the menu itself down and hands focus back, which the trigger's own state is what reports.
	await sr.press('Escape');
	await expect(surface).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(trigger).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expectAnnouncesAfterChange(sr, collapsedTrigger);
}
