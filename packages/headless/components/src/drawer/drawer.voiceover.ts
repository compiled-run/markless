import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { DRAWER_ANCHOR, readDrawerTranscript } from './drawer-transcript.ts';

voiceOverTest(
	'VoiceOver reaches the drawer only once its trigger has opened it',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${DRAWER_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readDrawerTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
