import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../sr-app/preview-server.ts';
import { realDriver } from '../../test-support/page-driver.ts';
import { voiceOverSpec } from '../../test-support/vocabularies.ts';
import { readCalendarTranscript } from './calendar-transcript.ts';

voiceOverTest('VoiceOver conveys each day as a button carrying its whole date, says which day may not be chosen, and follows the month the keys move to', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.calendar}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readCalendarTranscript(realDriver(voiceOver, voiceOverSpec), page);
});
