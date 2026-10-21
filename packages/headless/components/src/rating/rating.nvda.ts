import { nvdaTest } from '../../test-support/nvda-test.ts';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readRatingTranscript } from './rating-transcript.ts';

nvdaTest(
	'NVDA hears one checked mark in a rating whose fill is cumulative',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS['rating']}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await nvdaToAnchoredSection(nvda, page);

		await readRatingTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
