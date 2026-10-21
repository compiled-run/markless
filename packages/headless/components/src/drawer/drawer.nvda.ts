import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { DRAWER_ANCHOR, readDrawerTranscript } from './drawer-transcript.ts';

nvdaTest('NVDA reaches the drawer only once its trigger has opened it', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${DRAWER_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readDrawerTranscript(realDriver(nvda, nvdaSpec, page), page);
});
