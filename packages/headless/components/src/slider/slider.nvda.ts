import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readSliderTranscript } from './slider-transcript.ts';

nvdaTest('NVDA conveys the slider thumb, its value, a range slider\'s two same-named thumbs, and the value each arrow step moves it to', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.slider}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readSliderTranscript(realDriver(nvda, nvdaSpec, page), page);
});
