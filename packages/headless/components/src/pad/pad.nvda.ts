import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { PAD_ANCHOR, readPadTranscript } from './pad-transcript.ts';

nvdaTest(
	'NVDA conveys a pad handle as a 2D slider carrying both of its numbers',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${PAD_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await nvdaToAnchoredSection(nvda, page);

		await readPadTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
