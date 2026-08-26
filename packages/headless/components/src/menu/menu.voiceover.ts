import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { MENU_SECTION, readMenuTranscript } from './menu-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the trigger as a button holding a menu, follows the roving focus through the items, and reports the surface going',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENU_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readMenuTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
