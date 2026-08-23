import { expect } from '@playwright/test';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';

/**
 * The checkbox family's Basic scenario, read by a real screen reader.
 *
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * It covers only the two aria-at steps whose reader wording is recorded in
 * `../../test-support/README.md`: reading an unchecked box, and reading it again
 * after Space. Indeterminate, disabled and invalid stay on the virtual lane until a
 * CI run prints what these readers actually say about our markup.
 */

/** The name the Basic scenario gives its box. */
const BOX = 'Checkbox Label';

export const unchecked: Conveys = {
	role: 'checkbox',
	name: BOX,
	state: ['notChecked'],
};

export const checked: Conveys = {
	role: 'checkbox',
	name: BOX,
	state: ['checked'],
};

/**
 * A toggle reaches the DOM after the dispatch it woke returns, and a real
 * reader speaks on its own schedule on top of that, so the reader is asked
 * again until the new state is what it reads.
 */
async function expectAnnouncesAfterChange(
	sr: ScreenReaderDriver,
	conveys: Conveys,
	timeoutMs: number,
) {
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), conveys), { timeout: timeoutMs })
		.toEqual([]);
}

/**
 * Walk the reader to the checkbox and read it, before and after Space.
 *
 * Both reader specs call this, so the expectations live in one place and a new
 * reader is a driver plus two lines rather than a copied suite.
 */
export async function readCheckboxTranscript(
	sr: ScreenReaderDriver,
	options: { readonly changeTimeoutMs: number },
) {
	const announcement = await readUntil(sr, { role: 'checkbox' });
	expect(
		missingFacts(sr, announcement, unchecked),
		`${sr.name} announced "${announcement}"`,
	).toEqual([]);

	await sr.press(sr.keys.space);
	await expectAnnouncesAfterChange(sr, checked, options.changeTimeoutMs);
}
