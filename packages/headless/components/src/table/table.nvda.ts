import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTableTranscript, TABLE_ANCHOR } from './table-transcript.ts';

nvdaTest('NVDA conveys the grid, the row a header cell names, and the picked state a row carries', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TABLE_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readTableTranscript(realDriver(nvda, nvdaSpec), page);
});
