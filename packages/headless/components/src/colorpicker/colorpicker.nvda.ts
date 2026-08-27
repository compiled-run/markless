import { nvdaTest } from '@guidepup/playwright';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import {
	COLORPICKER_ANCHOR,
	COLORPICKER_ORIGIN,
	hasColorpickerSection,
	readColorpickerTranscript,
} from './colorpicker-transcript.ts';

nvdaTest('NVDA conveys the plane as two adjustable axis controls, the hue rail by its own name, and the colour each step moves to', async ({
	page,
	nvda,
}) => {
	await page.goto(`${COLORPICKER_ORIGIN}${COLORPICKER_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	// The gallery section is a follow-up; until it lands there is nothing to read.
	nvdaTest.skip(!(await hasColorpickerSection(page)), 'no colorpicker section on the gallery yet');
	// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
	await nvda.navigateToWebContent();

	await readColorpickerTranscript(realDriver(nvda, nvdaSpec), page);
});
