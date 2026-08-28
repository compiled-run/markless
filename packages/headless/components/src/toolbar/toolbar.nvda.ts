import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readToolbarTranscript, TOOLBAR_ANCHOR } from './toolbar-transcript.ts';

nvdaTest('NVDA conveys the named bar, each control by its own role, and an arrow that activates nothing', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TOOLBAR_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's own toolbar.
	await nvda.navigateToWebContent();

	await readToolbarTranscript(realDriver(nvda, nvdaSpec), page);
});
