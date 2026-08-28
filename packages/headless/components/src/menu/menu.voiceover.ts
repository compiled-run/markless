import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import {
	MENUBAR_SECTION,
	MENU_SECTION,
	readMenuTranscript,
	readMenubarTranscript,
} from './menu-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the trigger as a button holding a menu, follows the roving focus through the items, opens the submenu the nesting item holds, and reports each level going',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENU_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readMenuTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);

voiceOverTest(
	'VoiceOver conveys each item on the menu bar as a menu item holding a menu, opens one with ArrowDown, travels to the next menu with ArrowRight, and returns to the bar item on Escape',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENUBAR_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readMenubarTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
