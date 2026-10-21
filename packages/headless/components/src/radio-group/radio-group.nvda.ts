import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readRadioGroupTranscript } from './radio-group-transcript.ts';

nvdaTest('NVDA conveys every billing option and follows the group through a choice', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS['radio-group']}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readRadioGroupTranscript(realDriver(nvda, nvdaSpec, page), page);
});
