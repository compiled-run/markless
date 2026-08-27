import { voiceOverTest } from '@guidepup/playwright';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readTourTranscript, TOUR_URL } from './tour-transcript.ts';

voiceOverTest('VoiceOver conveys the tour opening, reads the first step, and reads the step that replaces it', async ({
	page,
	voiceOver,
}) => {
	await page.goto(TOUR_URL);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readTourTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
