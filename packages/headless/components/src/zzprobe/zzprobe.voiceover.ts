import { voiceOverTest } from '@guidepup/playwright';
import { runVariants } from './zzprobe-variants.ts';

voiceOverTest('probe: dialog naming markup under VoiceOver', async ({ page, voiceOver }) => {
	voiceOverTest.setTimeout(45 * 60_000);
	await runVariants("VoiceOver", page, voiceOver, () => voiceOver.navigateToWebContent());
});
