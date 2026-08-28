// Where this app answers when it is served. Everything that has to reach the
// served page - the boot check, the real-reader Playwright config - imports
// these instead of spelling a port of its own, so there is one place to change.
export const PREVIEW_HOST = '127.0.0.1';

export const DEFAULT_PREVIEW_PORT = 4319;

// Two worktrees checking this app at once would fight over one port, so the port
// is overridable. It is read here rather than in the boot check because the vite
// config binds from the same constant: a check that moved only its own origin
// would poll a port its server never bound.
const requested = Number(process.env.SR_GALLERY_PORT);
export const PREVIEW_PORT =
	Number.isInteger(requested) && requested > 0 && requested < 65_536
		? requested
		: DEFAULT_PREVIEW_PORT;

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
	'rating': '/#rating',
	tabs: '/#tabs',
	popover: '/#popover',
	slider: '/#slider',
	tooltip: '/#tooltip',
	'slider-range': '/#slider-range',
	datebox: '/#datebox',
	fileupload: '/#fileupload',
	hovercard: '/#hovercard',
	calendar: '/#calendar',
	ink: '/#ink',
	pad: '/#pad',
	crop: '/#crop',
	'crop-image': '/#crop-image',
	menu: '/#menu',
	menubar: '/#menubar',
	colorpicker: '/#colorpicker',
	buttongroup: '/#buttongroup',
	editable: '/#editable',
	taglist: '/#taglist',
	numberbox: '/#numberbox',
	'numberbox-min-max-step': '/#numberbox-min-max-step',
	'numberbox-currency': '/#numberbox-currency',
	tour: '/#tour',
	toolbar: '/#toolbar',
	drawer: '/#drawer',
	resizable: '/#resizable',
} as const;

export type FamilyName = keyof typeof FAMILY_ANCHORS;
