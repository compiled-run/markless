import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { MENUBAR_SECTION, readMenubarTranscript } from './menubar-transcript.ts';

voiceOverTest(
	'VoiceOver conveys each menu on the bar as a menu item holding a menu, opens one with ArrowDown, travels to the next menu with ArrowRight, and returns to its trigger on Escape',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENUBAR_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readMenubarTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
