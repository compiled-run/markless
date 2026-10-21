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
 *
 * The claim a real reader is here to test is what separates this family from
 * every other composite: the bar does not change what its children are. A menubar
 * dictates that its children are menu items; a toolbar groups controls that keep
 * their own roles, and collapses their tab stops into one. So the rows that
 * matter are "each control announced its own role" and "an arrow moved the
 * reading position without activating anything".
 *
 * Not asserted: the word for `role="toolbar"` itself. `Conveys.role` is keyed by
 * `test-support/driver.ts`'s `Vocabulary`, which has no `toolbar` slot, and
 * adding one is that file's to do. The bar's NAME is asserted, which is the half
 * that fails loudly if the `aria-labelledby` wiring breaks.
 */

const CHANGE_TIMEOUT_MS = 15_000;

/** Where the toolbar sits on the gallery page. */
export const TOOLBAR_ANCHOR = FAMILY_ANCHORS.toolbar;

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

export async function readToolbarTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TOOLBAR_ANCHOR.slice(2)}`);
	const buttonFor = (name: string) => section.getByRole('button', { name });

	// The bar is named by its label part. An unnamed toolbar tells a person only
	// that some controls belong together, which is why the label is not optional.
	const bar = await readUntil(sr, { name: 'Document' }, GALLERY_WALK_LIMIT);
	expectConveys(sr, bar, { name: 'Document' });

	// Entered as Tab enters it and crossed by focus: VoiceOver's next-item command steps over a toolbar as one group.
	await section.getByRole('toolbar').focus();
	await expect(buttonFor('Left')).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	expectConveys(sr, await sr.settleOnFocus(), { role: 'button', name: 'Left' });

	// An arrow moves the stop and activates nothing. The button group's own value
	// is the visible proof: the bar walks over its items without pressing one.
	await expect(buttonFor('Left')).toHaveAttribute('aria-pressed', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await sr.press(sr.keys.arrowRight);
	await expect(buttonFor('Center')).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	await expect(buttonFor('Left')).toHaveAttribute('aria-pressed', 'true');
	await expect(buttonFor('Center')).toHaveAttribute('aria-pressed', 'false');

	// And the control it landed on is what the reader announces next.
	expectConveys(sr, await sr.settleOnFocus(), { role: 'button', name: 'Center' });

	// Space presses the control under the cursor: it is a real button, and the bar
	// handles no activation key of its own.
	await sr.press(sr.keys.space);
	await expect(buttonFor('Center')).toHaveAttribute('aria-pressed', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});

	// Three families' controls, three roles, one bar. This is the whole claim.
	await sr.press(sr.keys.arrowRight);
	await expect(section.getByRole('switch', { name: 'Wrap lines' })).toBeFocused({
		timeout: CHANGE_TIMEOUT_MS,
	});
	expectConveys(sr, await sr.settleOnFocus(), { role: 'switch', name: 'Wrap lines' });

	await sr.press('End');
	await expect(buttonFor('Print')).toBeFocused({ timeout: CHANGE_TIMEOUT_MS });
	expectConveys(sr, await sr.settleOnFocus(), { role: 'button', name: 'Print' });
}
