import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readEditableTranscript } from './editable-transcript.ts';

nvdaTest('NVDA hears the value on the preview and follows the session into the field', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.editable}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readEditableTranscript(realDriver(nvda, nvdaSpec, page), page);
});
