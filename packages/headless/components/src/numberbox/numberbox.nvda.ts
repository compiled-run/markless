import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { NUMBERBOX_ANCHOR, readNumberboxTranscript } from './numberbox-transcript.ts';

nvdaTest(
	'NVDA conveys the field as a number field, both step buttons, and a stepped value',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${NUMBERBOX_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
		await nvda.navigateToWebContent();

		await readNumberboxTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
