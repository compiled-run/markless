import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readTooltipTranscript } from './tooltip-transcript.ts';

nvdaTest('NVDA conveys the tooltip as the trigger description, with the tip never shown', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.tooltip}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readTooltipTranscript(realDriver(nvda, nvdaSpec, page), page);
});
