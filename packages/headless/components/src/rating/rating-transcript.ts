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
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * that a cumulative fill is not what a reader hears. The marks up to the rating
 * are all filled on screen, and exactly one of them is the checked radio - so a
 * reader must announce one checked mark and four unchecked ones, not five
 * checked ones.
 */

const CHANGE_TIMEOUT_MS = 15_000;
const GROUP = 'Overall rating';

export async function readRatingTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS['rating'].slice(2)}`);

	// Named, not merely a radiogroup: the gallery serves the radio-group family's
	// own group earlier in the same document, and a walk from the top reaches it first.
	const group = await readUntil(sr, { role: 'radiogroup', name: GROUP }, GALLERY_WALK_LIMIT);
	expect(
		missingFacts(sr, group, { role: 'radiogroup', name: GROUP }),
		`${sr.name} announced "${group}"`,
	).toEqual([]);

	// The row the real lanes exist to carry: three marks are filled on screen and
	// only the third is the checked radio.
	const checkedMarks: ReadonlyArray<Conveys> = [
		{ role: 'radio', name: '1 of 5', state: ['notChecked'] },
		{ role: 'radio', name: '2 of 5', state: ['notChecked'] },
		{ role: 'radio', name: '3 of 5', state: ['checked'] },
		{ role: 'radio', name: '4 of 5', state: ['notChecked'] },
		{ role: 'radio', name: '5 of 5', state: ['notChecked'] },
	];
	for (const conveys of checkedMarks) {
		const mark = await readUntil(sr, { role: 'radio', name: conveys.name }, GALLERY_WALK_LIMIT);
		expect(missingFacts(sr, mark, conveys), `${sr.name} announced "${mark}"`).toEqual([]);
	}

	// An arrow both moves the rating and takes focus with it, so the reader is
	// asked again only once the mark it landed on carries the new state.
	await sr.press(sr.keys.arrowRight);
	await expect(section.getByRole('radio', { name: '4 of 5' })).toBeChecked({
		timeout: CHANGE_TIMEOUT_MS,
	});

	await expect
		.poll(
			async () =>
				missingFacts(sr, await sr.reannounce(), {
					role: 'radio',
					name: '4 of 5',
					state: ['checked'],
				}),
			{ timeout: CHANGE_TIMEOUT_MS },
		)
		.toEqual([]);
}
