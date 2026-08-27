import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { CROP_ANCHOR, readCropTranscript } from './crop-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the rectangle as a named crop area with eight slider handles',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${CROP_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readCropTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
