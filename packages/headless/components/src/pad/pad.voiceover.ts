import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { PAD_ANCHOR, readPadTranscript } from './pad-transcript.ts';

voiceOverTest(
	'VoiceOver conveys a pad handle as a 2D slider carrying both of its numbers',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${PAD_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readPadTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
