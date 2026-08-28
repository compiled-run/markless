import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readEditableTranscript } from './editable-transcript.ts';

nvdaTest('NVDA hears the value on the preview and follows the session into the field', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.editable}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readEditableTranscript(realDriver(nvda, nvdaSpec), page);
});
