import { expect, type Page } from '@playwright/test';
import { readUntil, type ScreenReaderDriver } from '../../test-support/driver.ts';

/**
 * Expectations are `Conveys` facts rather than any reader's wording, so this file
 * runs unchanged against NVDA and VoiceOver.
 *
 * What a real reader is here to settle is the one thing the virtual lane cannot:
 * that the preview control announces the VALUE and not a generic "edit", and that
 * opening a session moves a real reader's own cursor onto the field rather than
 * leaving it stranded on a control that just went `hidden`.
 */

// The gallery is one page of many families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 200;
const LABEL = 'Document name';
const VALUE = 'Quarterly plan';

/**
 * Where the editable sits on the gallery page.
 *
 * Spelled here rather than imported from `FAMILY_ANCHORS` because registration is
 * a follow-up unit and the gallery has no `editable` key yet. That unit moves this
 * constant into `apps/sr-gallery/preview-server.ts` and imports it back.
 */
export const EDITABLE_ANCHOR = '/#editable';

export async function readEditableTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${EDITABLE_ANCHOR.slice(2)}`);

	// The preview carries the words, which is the whole naming decision.
	await readUntil(sr, { role: 'button', name: VALUE }, WALK_LIMIT);

	await section.getByRole('button', { name: VALUE }).click();
	const field = section.getByRole('textbox', { name: LABEL });
	await expect(field).toBeVisible();
	await expect(field).toBeFocused();

	await readUntil(sr, { role: 'textbox', name: LABEL }, WALK_LIMIT);

	// And back: Escape returns the person to the control they started from, with
	// the value they started with.
	await field.press('Escape');
	await expect(section.getByRole('button', { name: VALUE })).toBeFocused();
}
