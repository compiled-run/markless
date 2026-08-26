import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { MENU_SECTION, readMenuTranscript } from './menu-transcript.ts';

nvdaTest(
	'NVDA conveys the trigger as a button holding a menu, follows the roving focus through the items, and reports the surface going',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENU_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's toolbar.
		await nvda.navigateToWebContent();

		await readMenuTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
