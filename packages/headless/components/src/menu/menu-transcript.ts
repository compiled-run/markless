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
 *
 * The submenu walk is the recursive shape: the nesting item is a `menuitem` that
 * also reports a popup and whether it is open, the surface it opens is a `menu`
 * named by that item, and Escape steps out one level onto the item again.
 */

// The menu section is not on the gallery page yet: adding it is the registration
// unit's, and this limit is sized for a section near the end of that page.
const WALK_LIMIT = 220;
const CHANGE_TIMEOUT_MS = 15_000;
const MENU_ANCHOR = '/#menu';
const MENUBAR_ANCHOR = '/#menubar';
const TRIGGER = 'Actions';
const FIRST_ITEM = 'Cut';
const SECOND_ITEM = 'Copy';
/** The item that holds a submenu, and the first command inside it. */
const NESTING_ITEM = 'Share';
const SUBMENU_ITEM = 'Email';

/** The anchor the gallery section will carry. It moves to FAMILY_ANCHORS with the section itself. */
export const MENU_SECTION = MENU_ANCHOR;
/** The menubar arrangement's own section, which the same registration unit adds. */
export const MENUBAR_SECTION = MENUBAR_ANCHOR;

/** The bar's own names, matching `scenarios/menubar.tsrx`. */
const BAR_FIRST = 'File';
const BAR_SECOND = 'Edit';
const BAR_FIRST_COMMAND = 'New';
const BAR_SECOND_COMMAND = 'Undo';

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

	// The nesting item is still a menu item, and it says a menu is there before it is opened.
	const nesting = section.getByRole('menuitem', { name: NESTING_ITEM });
	expectConveys(sr, await readUntil(sr, collapsedNestingItem, WALK_LIMIT), collapsedNestingItem);
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

/**
 * The menubar arrangement of the same family: `menu.root menubar`, no trigger,
 * and each bar item holding its own menu.
 *
 * The facts that differ from the transcript above are the ones worth a real
 * reader: the first thing met is a bar item rather than a button, ArrowDown is
 * what opens, ArrowRight inside an open menu travels to the NEXT menu rather
 * than walking the one it is in, and Escape returns to the bar item while the
 * bar itself stays where it is.
 */
export async function readMenubarTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${MENUBAR_ANCHOR.slice(2)}`);
	const bar = section.getByRole('menubar');
	const firstItem = section.getByRole('menuitem', { name: BAR_FIRST });
	const secondItem = section.getByRole('menuitem', { name: BAR_SECOND });
	const firstMenu = section.getByRole('menu', { name: BAR_FIRST });
	const secondMenu = section.getByRole('menu', { name: BAR_SECOND });

	const collapsedFirst: Conveys = { name: BAR_FIRST, state: ['notExpanded'] };
	const collapsedSecond: Conveys = { name: BAR_SECOND, state: ['notExpanded'] };

	// The bar is always showing, so the first thing met is a bar item that says it
	// holds a menu - there is no trigger to meet first.
	await expect(bar).toBeVisible();
	await expect(bar).toHaveAttribute('aria-orientation', 'horizontal');
	expectConveys(sr, await readUntil(sr, collapsedFirst, WALK_LIMIT), collapsedFirst);
	await expect(firstItem).toHaveAttribute('aria-haspopup', 'menu');

	await sr.press(sr.keys.arrowDown);
	await expect(firstItem).toHaveAttribute('aria-expanded', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expect(firstMenu).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(firstMenu.getByRole('menuitem', { name: BAR_FIRST_COMMAND })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: BAR_FIRST_COMMAND });

	// ArrowRight inside an open bar menu is travel to the next menu, not a walk
	// inside this one: the menu showing goes and the neighbour's opens on its first
	// command.
	await sr.press(sr.keys.arrowRight);
	await expect(firstMenu).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(secondMenu).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(secondMenu.getByRole('menuitem', { name: BAR_SECOND_COMMAND })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: BAR_SECOND_COMMAND });

	// Escape closes the open menu onto the bar item that opened it. The bar is not
	// a surface, so it is still there and there is no second Escape to press.
	await sr.press('Escape');
	await expect(secondMenu).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(secondItem).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expect(bar).toBeVisible();
	await expectAnnouncesAfterChange(sr, collapsedSecond);
}
