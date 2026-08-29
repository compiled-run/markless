import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readTableTranscript, TABLE_ANCHOR } from './table-transcript.ts';

voiceOverTest('VoiceOver conveys the grid, the row a header cell names, and the picked state a row carries', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TABLE_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readTableTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
