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
 * The scope is deliberately narrow. NVDA and VoiceOver are driven by keyboard and
 * reader commands, so neither of them hovers; a hover-revealed tip is not
 * something these lanes can produce, and faking it would test our own synthetic
 * events rather than the reader. What they do do is read a description on focus,
 * and they do it inconsistently - descriptions are the most unevenly handled ARIA
 * feature across products, which is exactly why one real-reader row is worth
 * having. So: walk to the trigger, and assert the tip is conveyed at all.
 *
 * Not asserted: where the description lands in the utterance, the word "tooltip"
 * (`role="tooltip"` contributes no announcement), or anything about the visual
 * overlay.
 */

const TRIGGER = 'Save';
const TIP = 'Save this draft';

const describedTrigger: Conveys = { role: 'button', name: TRIGGER };

function expectConveys(sr: ScreenReaderDriver, phrase: string, conveys: Conveys) {
	expect(missingFacts(sr, phrase, conveys), `${sr.name} announced "${phrase}"`).toEqual([]);
}

export async function readTooltipTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS.tooltip.slice(2)}`);
	const tip = section.getByRole('tooltip', { includeHidden: true });

	await expect(tip).toBeHidden();

	expectConveys(sr, await readUntil(sr, describedTrigger, GALLERY_WALK_LIMIT), describedTrigger);

	// The description is read on focus: NVDA's browse mode does not read descriptions at all.
	const trigger = section.getByRole('button', { name: TRIGGER });
	await trigger.focus();
	const phrase = await sr.settleOnFocus();
	expectConveys(sr, phrase, describedTrigger);
	expectConveys(sr, phrase, { name: TIP });

	// A focused trigger shows its tip.
	await expect(tip).toBeVisible();
}
