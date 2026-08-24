import { expect } from '@playwright/test';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver. It covers the two aria-at steps
 * whose reader wording is recorded: reading an unchecked box, and reading it
 * again after Space.
 */

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
