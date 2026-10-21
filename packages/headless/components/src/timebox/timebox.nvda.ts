import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { TIMEBOX_ANCHOR, readTimeBoxTranscript } from './timebox-transcript.ts';

nvdaTest('NVDA conveys the group of time boxes, each box\'s own name and bounds, and the words the AM/PM box holds', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TIMEBOX_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readTimeBoxTranscript(realDriver(nvda, nvdaSpec, page), page);
});
