import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { GRIDLIST_ANCHOR, readGridListTranscript } from './gridlist-transcript.ts';

nvdaTest('NVDA conveys the grid of rows, each row\'s own words, and the picked state a row carries', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${GRIDLIST_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readGridListTranscript(realDriver(nvda, nvdaSpec, page), page);
});
