import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { EDITABLE_ANCHOR, readEditableTranscript } from './editable-transcript.ts';

voiceOverTest(
	'VoiceOver hears the value on the preview and follows the session into the field',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${EDITABLE_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readEditableTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
