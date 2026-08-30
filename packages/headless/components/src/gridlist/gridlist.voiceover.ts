import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { GRIDLIST_ANCHOR, readGridListTranscript } from './gridlist-transcript.ts';

voiceOverTest('VoiceOver conveys the grid of rows, each row\'s own words, and the picked state a row carries', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${GRIDLIST_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readGridListTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
