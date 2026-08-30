import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { readCheckboxTranscript } from './checkbox-transcript.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';

voiceOverTest('VoiceOver conveys the checkbox family and follows it through a toggle', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.checkbox}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readCheckboxTranscript(realDriver(voiceOver, voiceOverSpec), { changeTimeoutMs: 15_000 });
});
