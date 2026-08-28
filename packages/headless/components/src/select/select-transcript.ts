import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS } from '../../../../../apps/sr-gallery/preview-server.ts';
import { missingFacts, readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';
import { GALLERY_WALK_LIMIT } from '../../test-support/gallery-walk.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const OPTIONS = ['Apple', 'Banana', 'Cherry'] as const;

// Enter rather than an arrow: a real reader is in its own reading mode, and
// activating the item under the cursor is the one gesture that reaches the page
// in both readers' default mode.
export async function readSelectTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.select.slice(2)}`);
	const trigger = section.getByRole('button', { name: 'Favorite Fruit' });

	const collapsed = await readUntil(
		sr,
		{ role: 'button', name: 'Favorite Fruit' },
		GALLERY_WALK_LIMIT,
	);
	expect(
		missingFacts(sr, collapsed, {
			role: 'button',
			name: 'Favorite Fruit',
			state: ['notExpanded'],
		}),
		`${sr.name} announced "${collapsed}"`,
	).toEqual([]);

	await sr.press(sr.keys.enter);
	await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: CHANGE_TIMEOUT_MS });

	// A closed listbox keeps its options out of the tree, so reaching all three by
	// name is the proof the popup opened for the reader and not only for the DOM.
	for (const option of OPTIONS) {
		await readUntil(sr, { role: 'option', name: option }, GALLERY_WALK_LIMIT);
	}
}
