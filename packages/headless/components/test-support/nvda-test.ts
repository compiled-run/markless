import { nvdaTest as guidepupNvdaTest } from '@guidepup/playwright';

/**
 * guidepup's NVDA test with browse-mode lines at NVDA's longest, 250 characters rather than 100, so fewer names
 * wrap onto a second line. The screen layout stays on, so a checkbox and its label share a line.
 */
export const nvdaTest = guidepupNvdaTest.extend({
	nvdaStartOptions: {
		capture: 'initial',
		settings: { virtualBuffers: { maxLineLength: 250 } },
	},
});
