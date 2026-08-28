import { voiceOverTest } from '@guidepup/playwright';
import { PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { RESIZABLE_ANCHOR, readResizableTranscript } from './resizable-transcript.ts';

voiceOverTest(
	'VoiceOver conveys the divider as a named splitter carrying the size of the panel it controls',
	async ({ page, voiceOver }) => {
		await page.goto(`${PREVIEW_ORIGIN}${RESIZABLE_ANCHOR}`);
		await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
		await voiceOver.navigateToWebContent();

		await readResizableTranscript(realDriver(voiceOver, voiceOverSpec), page);
	},
);
