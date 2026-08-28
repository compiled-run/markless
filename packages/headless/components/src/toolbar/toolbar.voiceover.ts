import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readToolbarTranscript, TOOLBAR_ANCHOR } from './toolbar-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the named bar, each control by its own role, and an arrow that activates nothing',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${TOOLBAR_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readToolbarTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
