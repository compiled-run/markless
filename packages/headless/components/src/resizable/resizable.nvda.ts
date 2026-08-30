import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { RESIZABLE_ANCHOR, readResizableTranscript } from './resizable-transcript.ts';

nvdaTest(
	'NVDA conveys the divider as a named splitter carrying the size of the panel it controls',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${RESIZABLE_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
		await nvda.navigateToWebContent();

		await readResizableTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
