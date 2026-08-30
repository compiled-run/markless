import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { GRIDLIST_ANCHOR, readGridListTranscript } from './gridlist-transcript.ts';

nvdaTest('NVDA conveys the grid of rows, each row\'s own words, and the picked state a row carries', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${GRIDLIST_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readGridListTranscript(realDriver(nvda, nvdaSpec), page);
});
