import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { INK_ANCHOR, readInkTranscript } from './ink-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the drawing as one named graphic and speaks a stroke that lands',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${INK_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readInkTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
