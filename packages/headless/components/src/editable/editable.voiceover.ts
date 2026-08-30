import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readEditableTranscript } from './editable-transcript.ts';

voiceOverTest(
	'VoiceOver hears the value on the preview and follows the session into the field',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.editable}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readEditableTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
