import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { RATING_GROUP_ANCHOR, readRatingGroupTranscript } from './rating-group-transcript.ts';

voiceOverTest('VoiceOver hears one checked mark in a rating whose fill is cumulative', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${RATING_GROUP_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readRatingGroupTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
