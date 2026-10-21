import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readModalTranscript } from './modal-transcript.ts';

nvdaTest('NVDA reaches the dialog only once its trigger has opened it', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.modal}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readModalTranscript(realDriver(nvda, nvdaSpec, page), page);
});
