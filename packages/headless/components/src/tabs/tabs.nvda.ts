import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTabsTranscript } from './tabs-transcript.ts';

nvdaTest('NVDA conveys the tab list and follows it through a tab change', async ({ page, nvda }) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.tabs}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readTabsTranscript(realDriver(nvda, nvdaSpec, page), page);
});
