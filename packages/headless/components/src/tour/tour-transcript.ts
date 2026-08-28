import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
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
 */

export const TOUR_ANCHOR = FAMILY_ANCHORS.tour;
export const TOUR_URL = `${PREVIEW_ORIGIN}${TOUR_ANCHOR}`;

const CHANGE_TIMEOUT_MS = 15_000;
const START = 'Take the tour';
const FIRST_TITLE = 'Save your work';
const SECOND_TITLE = 'Share it';

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

/**
 * Walk to the control that starts the tour, open it, read the first card, step
 * forward, and read the card that replaced it.
 *
 * The shared driver moves the reading cursor forward only, so each card is read
 * while the cursor is still standing on it.
 */
export async function readTourTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${TOUR_ANCHOR.slice(2)}`);
	// The gallery is consumer code and carries no test hooks, so each card is
	// reached the way a reader reaches it: by role and the name its title gives it.
	const firstCard = section.getByRole('dialog', { name: FIRST_TITLE });
	const secondCard = section.getByRole('dialog', { name: SECOND_TITLE });

	const startButton: Conveys = { role: 'button', name: START };
	expectConveys(sr, await readUntil(sr, startButton, GALLERY_WALK_LIMIT), startButton);

	await sr.press(sr.keys.enter);
	await expect(firstCard).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });

	// A card that is not the current step is `hidden`, which takes the whole
	// subtree out of the tree a reader walks, so reaching the dialog by role and
	// name is the proof it opened for the reader and not only for the DOM.
	expectConveys(sr, await readUntil(sr, { role: 'dialog', name: FIRST_TITLE }, GALLERY_WALK_LIMIT), {
		role: 'dialog',
		name: FIRST_TITLE,
	});

	const forward = section.getByRole('button', { name: 'Next' });
	await forward.click();
	await expect(secondCard).toBeVisible({ timeout: CHANGE_TIMEOUT_MS });
	await expect(firstCard).toBeHidden({ timeout: CHANGE_TIMEOUT_MS });

	// Moving a step lands focus on the incoming card, so the reader speaks it
	// without being walked there.
	expectConveys(sr, await sr.settleOnFocus(), { role: 'dialog', name: SECOND_TITLE });
}
