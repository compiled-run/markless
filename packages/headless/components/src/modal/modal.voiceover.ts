import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readModalTranscript } from './modal-transcript.ts';

voiceOverTest('VoiceOver reaches the dialog only once its trigger has opened it', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.modal}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readModalTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
