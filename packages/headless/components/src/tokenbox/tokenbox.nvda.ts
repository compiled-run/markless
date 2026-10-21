import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTokenBoxTranscript, TOKENBOX_ANCHOR } from './tokenbox-transcript.ts';

nvdaTest('NVDA speaks a token as text inside the one textbox', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${TOKENBOX_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readTokenBoxTranscript(realDriver(nvda, nvdaSpec, page), page);
});
