import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { RATING_GROUP_ANCHOR, readRatingGroupTranscript } from './rating-group-transcript.ts';

nvdaTest('NVDA hears one checked mark in a rating whose fill is cumulative', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${RATING_GROUP_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readRatingGroupTranscript(realDriver(nvda, nvdaSpec), page);
});
