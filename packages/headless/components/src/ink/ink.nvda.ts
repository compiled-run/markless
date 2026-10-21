import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { INK_ANCHOR, readInkTranscript } from './ink-transcript.ts';

nvdaTest(
	'NVDA conveys the drawing as one named graphic and speaks a stroke that lands',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${INK_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
			await nvdaToAnchoredSection(nvda, page);

		await readInkTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
