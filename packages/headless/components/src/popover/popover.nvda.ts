import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readPopoverTranscript } from './popover-transcript.ts';

nvdaTest('NVDA conveys the popover trigger opening and closing, and reads the surface it opens', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.popover}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readPopoverTranscript(realDriver(nvda, nvdaSpec, page), page);
});
