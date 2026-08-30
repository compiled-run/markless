import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readTokenBoxTranscript, TOKENBOX_ANCHOR } from './tokenbox-transcript.ts';

voiceOverTest(
	'VoiceOver speaks a token as text inside the one textbox',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${TOKENBOX_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readTokenBoxTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
