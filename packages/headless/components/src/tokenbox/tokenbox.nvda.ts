import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTokenBoxTranscript, TOKENBOX_ANCHOR } from './tokenbox-transcript.ts';

nvdaTest('NVDA speaks a token as text inside the one textbox', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${TOKENBOX_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readTokenBoxTranscript(realDriver(nvda, nvdaSpec), page);
});
