import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readHovercardTranscript } from './hovercard-transcript.ts';

voiceOverTest('VoiceOver conveys the link trigger as collapsed, then expanded once it has been rested on, walks into the card and hears the trigger again after Escape', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.hovercard}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readHovercardTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
