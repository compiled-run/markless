import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readSliderTranscript } from './slider-transcript.ts';

voiceOverTest('VoiceOver conveys the slider thumb, its value, a range slider\'s two same-named thumbs, and the value each arrow step moves it to', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.slider}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readSliderTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
