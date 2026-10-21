import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { CROP_ANCHOR, readCropTranscript } from './crop-transcript.ts';

nvdaTest(
	'NVDA conveys the rectangle as a named crop area with eight slider handles',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${CROP_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
			await nvdaToAnchoredSection(nvda, page);

		await readCropTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
