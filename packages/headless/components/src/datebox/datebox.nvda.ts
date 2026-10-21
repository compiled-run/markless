import { nvdaTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { readDateBoxTranscript } from './datebox-transcript.ts';

nvdaTest('NVDA conveys the group of three date boxes, each box\'s own name and bounds, and the value an arrow step moves it to', async ({
	page,
	nvda,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.datebox}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await nvdaToAnchoredSection(nvda, page);

	await readDateBoxTranscript(realDriver(nvda, nvdaSpec, page), page);
});
