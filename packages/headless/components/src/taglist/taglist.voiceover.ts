import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readTagListTranscript } from './taglist-transcript.ts';

voiceOverTest(
	'VoiceOver reaches every tag through the button that removes it',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.taglist}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readTagListTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
