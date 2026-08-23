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
 * Every expectation below is a `Conveys` from `../../test-support/driver.ts` -
 * the same shape `checkbox.sr.ts` asserts in, naming facts (role, accessible
 * name, state) rather than any reader's wording. The words for those facts come
 * from the driver, so this file runs unchanged against NVDA and VoiceOver.
 *
 * It covers the two steps of the aria-at checkbox plan whose reader wording is
 * recorded in `../../test-support/README.md`: reading an unchecked box, and
 * reading it again after Space. The states the virtual lane also covers -
 * indeterminate, disabled, invalid - are deliberately absent until a CI run
 * prints what these readers actually say about our markup. See
 * `../../test-support/vocabularies.ts`.
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
