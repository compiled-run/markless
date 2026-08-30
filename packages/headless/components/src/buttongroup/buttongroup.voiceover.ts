import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readButtonGroupTranscript, BUTTONGROUP_ANCHOR } from './buttongroup-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the group, every toggle button, and an arrow that presses nothing',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${BUTTONGROUP_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readButtonGroupTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
