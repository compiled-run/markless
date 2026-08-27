import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readToggleGroupTranscript, TOGGLEGROUP_ANCHOR } from './togglegroup-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the group, every toggle button, and an arrow that presses nothing',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${TOGGLEGROUP_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readToggleGroupTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
