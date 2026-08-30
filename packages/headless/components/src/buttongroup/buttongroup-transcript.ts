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
 * The claim a real reader is here to test is the family's whole shape: a named
 * `role="group"` holding real buttons, and one tab stop that arrows move without
 * pressing anything. That last half is what separates this family from
 * `radiogroup`, where an arrow both moves and chooses, so the row that matters
 * most is the one asserting the group's value did not change under an arrow.
 *
 * Not asserted: `aria-pressed`, which neither reader has a `Vocabulary` slot for -
 * pressed-ness is asserted on the element instead, the way calendar asserts a
 * chosen day.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const ITEMS = ['Left', 'Center', 'Right'] as const;
const GROUP = 'Text alignment';

export const BUTTONGROUP_ANCHOR = FAMILY_ANCHORS.buttongroup;

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

export async function readButtonGroupTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${BUTTONGROUP_ANCHOR.slice(2)}`);
	const itemFor = (name: string) => section.getByRole('button', { name });

	// Named, not merely a group: checklist, editable and crop serve one too, and
	// NVDA calls a radiogroup "grouping" as well.
	const group = await readUntil(sr, { role: 'group', name: GROUP }, GALLERY_WALK_LIMIT);
	expectConveys(sr, group, { role: 'group', name: GROUP });

	for (const name of ITEMS) {
		const item = await readUntil(sr, { role: 'button', name }, GALLERY_WALK_LIMIT);
		expectConveys(sr, item, { role: 'button', name });
	}

	// The starter serves one pressed item, and both values are written out rather
	// than one being left off.
	await expect(itemFor('Left')).toHaveAttribute('aria-pressed', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expect(itemFor('Center')).toHaveAttribute('aria-pressed', 'false');

	// An arrow moves the reading position and presses nothing. This is the row the
	// real lanes exist to carry for this family.
	await sr.press(sr.keys.arrowRight);
	await expect(itemFor('Left')).toHaveAttribute('aria-pressed', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expect(itemFor('Center')).toHaveAttribute('aria-pressed', 'false');

	// Space presses the item under the cursor: it is a real button, so the browser
	// activates it and the family handles no activation key of its own.
	await sr.press(sr.keys.space);
	await expect(itemFor('Center')).toHaveAttribute('aria-pressed', 'true', {
		timeout: CHANGE_TIMEOUT_MS,
	});
	await expect(itemFor('Left')).toHaveAttribute('aria-pressed', 'false');

	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), { role: 'button', name: 'Center' }), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}
