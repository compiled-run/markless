import { voiceOverTest } from '@guidepup/playwright';
import { FAMILY_ANCHORS, PREVIEW_ORIGIN } from '../../../../apps/sr-gallery/preview-server.ts';
import { readCheckboxTranscript } from './checkbox-transcript.ts';
import { realDriver } from './page-driver.ts';
import { voiceOverSpec } from './vocabularies.ts';

// Real VoiceOver reading the served gallery. Same expectations as the NVDA
// spec, a different vocabulary for the same facts.
voiceOverTest('VoiceOver conveys the checkbox family and follows it through a toggle', async ({
	page,
	voiceOver,
}) => {
	await page.goto(`${PREVIEW_ORIGIN}${FAMILY_ANCHORS.checkbox}`);
	await page.waitForFunction(() => document.documentElement.dataset.galleryReady === 'true');
	await voiceOver.navigateToWebContent();

	await readCheckboxTranscript(realDriver(voiceOver, voiceOverSpec), { changeTimeoutMs: 15_000 });
});
