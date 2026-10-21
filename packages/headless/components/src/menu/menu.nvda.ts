import { nvdaTest } from '../../test-support/nvda-test.ts';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { nvdaToAnchoredSection, realDriver } from '../../test-support/page-driver.ts';
import { nvdaSpec } from '../../test-support/vocabularies.ts';
import { MENU_SECTION, readMenuTranscript } from './menu-transcript.ts';

nvdaTest(
	'NVDA conveys the trigger as a button holding a menu, follows the roving focus through the items, opens the submenu the nesting item holds, and reports each level going',
	async ({ page, nvda }) => {
		await page.goto(`${PREVIEW_ORIGIN}${MENU_SECTION}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
			await nvdaToAnchoredSection(nvda, page);

		await readMenuTranscript(realDriver(nvda, nvdaSpec, page), page);
	},
);
