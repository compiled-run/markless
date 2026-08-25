// Where this app answers when it is served. Everything that has to reach the
// served page - the boot check, the real-reader Playwright config - imports
// these instead of spelling a port of its own, so there is one place to change.
export const PREVIEW_HOST = '127.0.0.1';
export const PREVIEW_PORT = 4319;
export const PREVIEW_ORIGIN = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

/**
 * The anchor each family's Basic scenario sits on, plus a section of its own for
 * a second shape a reader announces differently. One page, one section per
 * anchor: a reader lands on `${PREVIEW_ORIGIN}/#checkbox` and the checkbox
 * section is the first thing under the cursor.
 */
export const FAMILY_ANCHORS = {
	checkbox: '/#checkbox',
	toggle: '/#toggle',
	textbox: '/#textbox',
	progress: '/#progress',
	checklist: '/#checklist',
	select: '/#select',
	modal: '/#modal',
	'radio-group': '/#radio-group',
	tabs: '/#tabs',
	popover: '/#popover',
	slider: '/#slider',
	tooltip: '/#tooltip',
	'slider-range': '/#slider-range',
} as const;

export type FamilyName = keyof typeof FAMILY_ANCHORS;
