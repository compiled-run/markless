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
 * The claim a real reader is here to test is the composition: three whole,
 * ordinary menus stand inside the bar, and what a reader meets first is a menu
 * ITEM rather than the button each menu would offer on its own. Then ArrowDown
 * opens, ArrowRight inside an open menu travels to the NEXT menu rather than
 * walking the one it is in, and Escape returns to the trigger while the bar
 * itself stays where it is.
 *
 * `menu` and `menuitem` have no word in the shared `Vocabulary` yet - that file
 * belongs to the unit that registers the family - so the roles are asserted from
 * the page and the reader is held to the name and the state.
 */

// The bar is not on the gallery page yet: adding it, and its entry in
// FAMILY_ANCHORS, is the registration unit's. This limit is sized for a section
// near the end of that page.
const WALK_LIMIT = 220;
const CHANGE_TIMEOUT_MS = 15_000;
const MENUBAR_ANCHOR = '/#menubar';

/** The anchor the gallery section will carry. It moves to FAMILY_ANCHORS with the section itself. */
export const MENUBAR_SECTION = MENUBAR_ANCHOR;

/** The bar's own names, matching `scenarios/basic.tsrx`. */
const BAR_FIRST = 'File';
const BAR_SECOND = 'Edit';
const BAR_FIRST_COMMAND = 'New';
const BAR_SECOND_COMMAND = 'Undo';

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

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

export async function readMenubarTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${MENUBAR_ANCHOR.slice(2)}`);
	const bar = section.getByRole('menubar');
	const firstTrigger = section.getByRole('menuitem', { name: BAR_FIRST });
	const secondTrigger = section.getByRole('menuitem', { name: BAR_SECOND });
	const firstMenu = section.getByRole('menu', { name: BAR_FIRST });
	const secondMenu = section.getByRole('menu', { name: BAR_SECOND });

	const collapsedFirst: Conveys = { name: BAR_FIRST, state: ['notExpanded'] };
	const collapsedSecond: Conveys = { name: BAR_SECOND, state: ['notExpanded'] };

	// The bar is always showing, and each menu's own trigger is one of its items.
	await expect(bar).toBeVisible();
	await expect(bar).toHaveAttribute('aria-orientation', 'horizontal');
	expectConveys(sr, await readUntil(sr, collapsedFirst, WALK_LIMIT), collapsedFirst);
	await expect(firstTrigger).toHaveAttribute('aria-haspopup', 'menu');

	await sr.press(sr.keys.arrowDown);
	await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expect(firstMenu).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(firstMenu.getByRole('menuitem', { name: BAR_FIRST_COMMAND })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: BAR_FIRST_COMMAND });

	// Travel: the menu showing goes and the neighbour's opens on its first command.
	await sr.press(sr.keys.arrowRight);
	await expect(secondMenu).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(firstMenu).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(secondMenu.getByRole('menuitem', { name: BAR_SECOND_COMMAND })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { name: BAR_SECOND_COMMAND });

	// Escape closes the open menu onto the trigger that opened it. The bar is not a
	// surface, so it is still there and there is no second Escape to press.
	await sr.press('Escape');
	await expect(secondMenu).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });
	await expect(secondTrigger).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expect(bar).toBeVisible();
	await expectAnnouncesAfterChange(sr, collapsedSecond);
}
