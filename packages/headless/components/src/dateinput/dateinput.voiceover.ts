import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../../apps/sr-gallery/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readDateinputTranscript } from './dateinput-transcript.ts';

voiceOverTest('VoiceOver conveys the group of three date boxes, each box\'s own name and bounds, and the value an arrow step moves it to', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.dateinput}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readDateinputTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
