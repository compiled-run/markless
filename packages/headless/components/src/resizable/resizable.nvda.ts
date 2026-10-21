import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { RESIZABLE_ANCHOR, readResizableTranscript } from './resizable-transcript.ts';

nvdaTest(
	'NVDA conveys the divider as a named splitter carrying the size of the panel it controls',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${RESIZABLE_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
			await nvdaToAnchoredSection(nvda, page);

		await readResizableTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
