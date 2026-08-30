import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readButtonGroupTranscript, BUTTONGROUP_ANCHOR } from './buttongroup-transcript.ts';

nvdaTest('NVDA conveys the group, every toggle button, and an arrow that presses nothing', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${BUTTONGROUP_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readButtonGroupTranscript(realDriver(nvda, nvdaSpec), page);
});
