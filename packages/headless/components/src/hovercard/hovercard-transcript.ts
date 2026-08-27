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
 *
 * This is the family whose central claim a real reader can test rather than a
 * corner of it. Neither NVDA nor VoiceOver hovers, but nothing in the keyboard
 * story needs a pointer: the trigger is a link that says a surface is there and
 * shut, resting on it opens the surface, Tab walks into it, and Escape closes it
 * and hands focus back. Radix and Base UI both take the content out of the tab
 * sequence on purpose; these four steps are what we ship instead, so a red row
 * here is a claim in `../hovercard/note.md` failing rather than a detail.
 *
 * Not asserted: anything a pointer would produce, the wording of the
 * announcement, or where the card lands on screen.
 */

// The hovercard section is the last on the gallery page, so a walk that starts
// at the top of the document needs more steps than any other family's.
const WALK_LIMIT = 340;
// The gallery runs the family's real defaults, so opening waits out `delay`
// (700ms) on top of whatever the reader and the runner cost.
const CHANGE_TIMEOUT_MS = 15_000;
const TRIGGER = 'Jane Doe';
const CARD_LINK = 'Open profile';

const collapsedTrigger: Conveys = { role: 'link', name: TRIGGER, state: ['notExpanded'] };
const expandedTrigger: Conveys = { role: 'link', name: TRIGGER, state: ['expanded'] };
const cardLink: Conveys = { role: 'link', name: CARD_LINK };

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

// Nothing re-reads the trigger when the delay elapses under it - the card is no
// live region and must not be - so the reader is stepped off the item and back
// on until it reads the new state off the live DOM.
async function expectReannounces(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

// A reader following the focus speaks by itself, so the phrase is read rather
// than asked for.
async function expectSpeaksOnFocus(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.settleOnFocus(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

export async function readHovercardTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.hovercard.slice(2)}`);
	const trigger = section.getByRole('link', { name: TRIGGER });
	// `includeHidden`, so the closed row below asserts the card is hidden rather
	// than passing on a locator that matched nothing.
	const inCard = section.getByRole('link', { name: CARD_LINK, includeHidden: true });

	expectConveys(sr, await readUntil(sr, collapsedTrigger, WALK_LIMIT), collapsedTrigger);

	// Focus rather than the reading cursor, and for the same reason datebox uses
	// it: a reading cursor standing on the link is not the browser's focus, and
	// this family opens on focus. This is the DOM outcome a Tab onto the trigger
	// produces, without depending on where the focus happened to be before.
	await trigger.focus();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });
	await expectReannounces(sr, expandedTrigger);

	// The whole divergence from Radix and Base UI in one gesture: the card is the
	// trigger's next DOM sibling, so its links are simply next in the tab order.
	await sr.press('Tab');
	await expect(inCard).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	// Closing is scoped to the root, so leaving the trigger for the card is an
	// intra-root move and the card stays showing.
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await expectSpeaksOnFocus(sr, cardLink);

	await sr.press('Escape');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false', { timeout: CHANGE_TIMEOUT_MS });
	// Escape is the one dismissal that hands focus back; an outside press is a
	// person choosing where to be.
	await expect(trigger).toBeFocused();
	await expect(inCard).toBeHidden();
}
