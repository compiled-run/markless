import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readButtonGroupTranscript, BUTTONGROUP_ANCHOR } from './buttongroup-transcript.ts';

nvdaTest('NVDA conveys the group, every toggle button, and an arrow that presses nothing', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${BUTTONGROUP_ANCHOR}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readButtonGroupTranscript(realDriver(nvda, nvdaSpec, page), page);
});
