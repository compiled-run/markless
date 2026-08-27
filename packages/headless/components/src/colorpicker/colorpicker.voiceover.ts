import { voiceOverTest } from '@guidepup/playwright';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import {
	COLORPICKER_ANCHOR,
	COLORPICKER_ORIGIN,
	hasColorpickerSection,
	readColorpickerTranscript,
} from './colorpicker-transcript.ts';

voiceOverTest('VoiceOver conveys the plane as two adjustable axis controls, the hue rail by its own name, and the colour each step moves to', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${COLORPICKER_ORIGIN}${COLORPICKER_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The gallery section is a follow-up; until it lands there is nothing to read.
	voiceOverTest.skip(
		!(await hasColorpickerSection(page)),
		'no colorpicker section on the gallery yet',
	);
	await voiceOver.navigateToWebContent();

	await readColorpickerTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
