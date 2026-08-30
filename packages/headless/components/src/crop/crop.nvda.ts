import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { CROP_ANCHOR, readCropTranscript } from './crop-transcript.ts';

nvdaTest(
	'NVDA conveys the rectangle as a named crop area with eight slider handles',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${CROP_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
		await nvda.navigateToWebContent();

		await readCropTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
