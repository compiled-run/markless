import { nvdaTest } from '@guidepup/playwright';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTourTranscript, TOUR_URL } from './tour-transcript.ts';

nvdaTest('NVDA conveys the tour opening, reads the first step, and reads the step that replaces it', async ({
	page,
	nvda,
}) => {
	await page.goto(TOUR_URL);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readTourTranscript(realDriver(nvda, nvdaSpec), page);
});
