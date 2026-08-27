import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { NUMBERBOX_ANCHOR, readNumberboxTranscript } from './numberbox-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the field as a number field, both step buttons, and a stepped value',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${NUMBERBOX_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readNumberboxTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
