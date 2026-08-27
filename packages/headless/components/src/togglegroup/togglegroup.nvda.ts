import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readToggleGroupTranscript, TOGGLEGROUP_ANCHOR } from './togglegroup-transcript.ts';

nvdaTest('NVDA conveys the group, every toggle button, and an arrow that presses nothing', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${TOGGLEGROUP_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readToggleGroupTranscript(realDriver(nvda, nvdaSpec), page);
});
