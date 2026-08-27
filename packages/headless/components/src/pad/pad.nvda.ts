import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { PAD_ANCHOR, readPadTranscript } from './pad-transcript.ts';

nvdaTest(
	'NVDA conveys a pad handle as a 2D slider carrying both of its numbers',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${PAD_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
		await nvda.navigateToWebContent();

		await readPadTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
