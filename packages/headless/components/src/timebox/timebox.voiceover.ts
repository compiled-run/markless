import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { TIMEBOX_ANCHOR, readTimeBoxTranscript } from './timebox-transcript.ts';

voiceOverTest('VoiceOver conveys the group of time boxes, each box\'s own name and bounds, and the words the AM/PM box holds', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TIMEBOX_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readTimeBoxTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
