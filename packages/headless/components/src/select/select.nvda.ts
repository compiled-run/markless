import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readSelectTranscript } from './select-transcript.ts';

nvdaTest('NVDA conveys the collapsed select and reaches its options once it opens', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.select}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readSelectTranscript(realDriver(nvda, nvdaSpec, page), page);
});
