import { nvdaTest } from '@guidepup/playwright';
import { expect, type Page } from '@playwright/test';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import {
	missingFacts,
	readUntil,
	type Conveys,
	type ScreenReaderDriver,
} from '../../test-support/driver.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';

// The gallery is one page of nine families, so a walk that starts at the top of
// the document needs far more steps than the virtual lane's container walk.
const WALK_LIMIT = 140;
const CHANGE_TIMEOUT_MS = 15_000;
const OPTIONS = ['Monthly', 'Annual', 'Lifetime'] as const;

// A choice reaches the DOM after the dispatch it woke returns, and a real reader
// speaks on its own schedule on top of that, so the reader is asked again until
// the new state is what it reads.
async function expectAnnouncesAfterChange(sr: ScreenReaderDriver, conveys: Conveys) {
	await expect
		.poll(async () => missingFacts(sr, await sr.reannounce(), conveys), {
			timeout: CHANGE_TIMEOUT_MS,
		})
		.toEqual([]);
}

// This is the row the real lanes exist to carry: the family sets the `checked`
// property and never the content attribute, so a reader built on the platform
// tree is the only one that can see the choice land.
async function readRadioGroupTranscript(sr: ScreenReaderDriver, page: Page) {
	const section = page.locator(`#${FAMILY_ANCHORS['radio-group'].slice(2)}`);

	const group = await readUntil(sr, { role: 'radiogroup' }, WALK_LIMIT);
	expect(
		missingFacts(sr, group, { role: 'radiogroup', name: 'Billing Period' }),
		`${sr.name} announced "${group}"`,
	).toEqual([]);

	for (const name of OPTIONS) {
		const option = await readUntil(sr, { role: 'radio', name }, WALK_LIMIT);
		expect(
			missingFacts(sr, option, { role: 'radio', name, state: ['notChecked'] }),
			`${sr.name} announced "${option}"`,
		).toEqual([]);
	}

	// Space rather than an arrow: the authoring practices give a radio one
	// activation key, and it is the gesture that reaches the page in both readers'
	// default reading mode.
	await sr.press(sr.keys.space);
	await expect(section.getByRole('radio', { name: 'Lifetime' })).toBeChecked({
		timeout: CHANGE_TIMEOUT_MS,
	});

	await expectAnnouncesAfterChange(sr, { role: 'radio', name: 'Lifetime', state: ['checked'] });
}

nvdaTest('NVDA conveys every billing option and follows the group through a choice', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS['radio-group']}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readRadioGroupTranscript(realDriver(nvda, nvdaSpec), page);
});
