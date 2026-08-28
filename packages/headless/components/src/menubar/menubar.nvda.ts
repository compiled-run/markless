import { nvdaTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { MENUBAR_SECTION, readMenubarTranscript } from './menubar-transcript.ts';

nvdaTest(
	'NVDA conveys each item on the bar as a menu item holding a menu, opens one with ArrowDown, travels to the next item with ArrowRight, and returns to it on Escape',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENUBAR_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		// The cursor starts wherever the browser chrome left it, so the walk would otherwise cover the app window's own toolbar.
		await nvda.navigateToWebContent();

		await readMenubarTranscript(realDriver(nvda, nvdaSpec), page);
	},
);
