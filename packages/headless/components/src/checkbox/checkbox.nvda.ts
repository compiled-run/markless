import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { readCheckboxTranscript } from './checkbox-transcript.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';

nvdaTest('NVDA conveys the checkbox family and follows it through a toggle', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.checkbox}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The reader's cursor starts wherever the browser chrome left it; this puts it
	// at the top of the document so the walk below is over the page, not the app
	// window's toolbar.
	await nvda.navigateToWebContent();

	await readCheckboxTranscript(realDriver(nvda, nvdaSpec), { changeTimeoutMs: 15_000 });
});
