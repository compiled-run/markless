import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readHovercardTranscript } from './hovercard-transcript.ts';

nvdaTest('NVDA conveys the link trigger as collapsed, then expanded once it has been rested on, walks into the card and hears the trigger again after Escape', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.hovercard}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readHovercardTranscript(realDriver(nvda, nvdaSpec, page), page);
});
