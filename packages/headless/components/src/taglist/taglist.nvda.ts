import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTagListTranscript } from './taglist-transcript.ts';

nvdaTest('NVDA reaches every tag through the button that removes it', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.taglist}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readTagListTranscript(realDriver(nvda, nvdaSpec, page), page);
});
