import { nvdaTest } from '../../test-support/nvda-test.ts';
import { runVariants } from './zzprobe-variants.ts';

nvdaTest('probe: dialog naming markup under NVDA', async ({ page, nvda }) => {
	nvdaTest.setTimeout(45 * 60_000);
	await runVariants('NVDA', page, nvda, () => nvda.navigateToWebContent());
});
