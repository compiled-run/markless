import { nvdaTest as guidepupNvdaTest } from '@guidepup/playwright';

/**
 * guidepup's NVDA test, started with one control to a browse-mode line: with the screen layout on, a line holds
 * every inline control and wraps at 100 characters, mid-name.
 */
export const nvdaTest = guidepupNvdaTest.extend({
	nvdaStartOptions: {
		capture: 'initial',
		settings: { virtualBuffers: { useScreenLayout: false } },
	},
});
