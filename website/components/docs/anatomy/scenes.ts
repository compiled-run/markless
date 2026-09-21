export type AnatomyShape = {
	readonly part: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly text: string;
	readonly kind: 'surface' | 'wash' | 'text' | 'round' | 'line';
	readonly icon?: 'chevron-down' | 'chevron-right' | 'chevron-left';
};

export type AnatomyScene = {
	readonly caption: string;
	readonly descriptions?: Readonly<Record<string, string>>;
	readonly shapes: readonly AnatomyShape[];
};

const box = (
	part: string,
	x: number,
	y: number,
	width: number,
	height: number,
	text = '',
	kind: AnatomyShape['kind'] = 'surface',
	icon?: AnatomyShape['icon'],
): AnatomyShape => ({ part, x, y, width, height, text, kind, icon });

const overlay = (family: 'modal' | 'drawer' | 'popover'): AnatomyScene => ({
	descriptions: {
		trigger: 'The control that opens the panel.',
		close: 'The control that closes the panel.',
	},
	caption:
		family === 'drawer' ? 'A panel at the edge of the page.' : 'A trigger and its open panel.',
	shapes: [
		box('root', 100, 70, 440, 280, '', 'line'),
		...(family === 'popover' ? [] : [box('backdrop', 110, 80, 420, 260, '', 'wash')]),
		box('trigger', 125, 95, 130, 38, 'Open details'),
		box('content', family === 'drawer' ? 310 : 210, 160, family === 'drawer' ? 220 : 290, 160),
		box('title', family === 'drawer' ? 325 : 230, 180, 140, 30, 'Project details', 'text'),
		box('description', family === 'drawer' ? 325 : 230, 225, 175, 50, 'A little more context.', 'text'),
		box('close', family === 'drawer' ? 490 : 460, 173, 28, 28, '×'),
	],
});

const choice = (family: 'select' | 'combobox'): AnatomyScene => ({
	descriptions: {
		root: 'Holds the selection and connects the label, input or trigger, and options.',
	},
	caption: 'The selected value, an open list, and one option.',
	shapes: [
		box('root', 155, 65, 330, 300, '', 'line'),
		box('label', 175, 75, 180, 28, 'Your workspace', 'text'),
		box(family === 'combobox' ? 'input' : 'trigger', 175, 115, 285, 45, 'Design studio'),
		...(family === 'combobox' ? [box('trigger', 417, 119, 38, 37, '', 'surface', 'chevron-down')] : []),
		box('content', 175, 175, 285, 165),
		box('item', 185, 185, 265, 42, '', 'wash'),
		box('itemlabel', 198, 190, 205, 32, 'Design studio', 'text'),
		box('itemindicator', 415, 195, 22, 22, '✓', 'text'),
		box('item', 185, 232, 265, 42, 'Engineering', 'text'),
		box('item', 185, 279, 265, 42, 'Customer care', 'text'),
	],
});

export const scenes: Readonly<Record<string, AnatomyScene>> = {
	accordion: {
		descriptions: { itemtrigger: 'The button that opens or closes an item.' },
		caption: 'One open item. The label wraps its trigger; the content is its sibling.',
		shapes: [
			box('root', 135, 100, 370, 230, '', 'line'),
			box('item', 150, 115, 340, 200),
			box('itemlabel', 156, 121, 328, 46, '', 'wash'),
			box('itemtrigger', 165, 128, 310, 32, 'What is included?', 'surface', 'chevron-down'),
			box('itemcontent', 165, 185, 310, 110, 'Components, pages & design tokens.', 'text'),
		],
	},
	collapsible: {
		descriptions: { trigger: 'The button that opens or closes the content.' },
		caption: 'A disclosure trigger with its content underneath.',
		shapes: [
			box('root', 135, 115, 370, 190, '', 'line'),
			box('trigger', 150, 130, 340, 45, 'Project details', 'wash', 'chevron-down'),
			box('content', 165, 195, 310, 85, 'Manage settings and collaborators.', 'text'),
		],
	},
	tabs: {
		caption: 'A list of triggers. Each value pairs a tab with its panel.',
		shapes: [
			box('root', 115, 115, 410, 190, '', 'line'),
			box('list', 130, 130, 380, 48),
			box('trigger', 134, 134, 123, 40, 'Overview', 'wash'),
			box('trigger', 260, 134, 123, 40, 'Activity', 'text'),
			box('trigger', 386, 134, 120, 40, 'Settings', 'text'),
			box('content', 130, 182, 380, 105, 'Your workspace at a glance.'),
		],
	},
	toggle: {
		descriptions: { trigger: 'The switch control; it holds the moving thumb.' },
		caption: 'The thumb sits inside the trigger; the label names the switch.',
		shapes: [
			box('root', 135, 80, 370, 280, '', 'line'),
			box('label', 160, 100, 260, 36, 'Keep me in the loop', 'text'),
			box('trigger', 165, 165, 260, 116, '', 'wash'),
			box('thumb', 321, 177, 92, 92, '', 'round'),
			box('description', 160, 303, 300, 32, 'A small note when something changes.', 'text'),
		],
	},
	checkbox: {
		descriptions: { trigger: 'The control that changes the checked value.' },
		caption: 'The indicator lives inside the trigger. The label sits beside it.',
		shapes: [
			box('root', 125, 125, 390, 170, '', 'line'),
			box('trigger', 150, 150, 48, 48, '', 'wash'),
			box('indicator', 159, 159, 30, 30, '✓', 'text'),
			box('label', 215, 153, 265, 40, 'Send me the weekly digest', 'text'),
			box('description', 215, 218, 265, 35, 'Good things, once a week.', 'text'),
		],
	},
	radiogroup: {
		descriptions: { itemtrigger: 'The control that chooses this item.' },
		caption: 'One group, two items. Each item owns its trigger and label.',
		shapes: [
			box('root', 145, 85, 350, 250, '', 'line'),
			box('label', 165, 105, 280, 30, 'Choose your rhythm', 'text'),
			box('item', 165, 155, 310, 65),
			box('itemtrigger', 180, 172, 30, 30, '', 'round'),
			box('itemindicator', 188, 180, 14, 14, '', 'wash'),
			box('itemlabel', 225, 168, 230, 38, 'Weekly', 'text'),
			box('item', 165, 235, 310, 65),
			box('itemtrigger', 180, 252, 30, 30, '', 'round'),
			box('itemlabel', 225, 248, 230, 38, 'Monthly', 'text'),
		],
	},
	textbox: {
		caption: 'A label, an input, and supporting text share one root.',
		shapes: [
			box('root', 135, 105, 370, 210, '', 'line'),
			box('label', 155, 120, 250, 32, 'Project name', 'text'),
			box('input', 155, 170, 330, 50, 'A small, good thing'),
			box('description', 155, 242, 330, 38, 'Give your next idea a name.', 'text'),
		],
	},
	select: choice('select'),
	combobox: choice('combobox'),
	modal: overlay('modal'),
	drawer: overlay('drawer'),
	popover: overlay('popover'),
	hovercard: {
		caption: 'A preview anchored to the element that opens it.',
		shapes: [
			box('root', 140, 80, 360, 270, '', 'line'),
			box('trigger', 170, 100, 175, 42, '@designstudio', 'wash'),
			box('content', 170, 170, 300, 150, 'A small team making good things.'),
		],
	},
	tooltip: {
		caption: 'A short hint attached to its trigger.',
		shapes: [
			box('root', 170, 105, 300, 210, '', 'line'),
			box('content', 210, 130, 220, 55, 'Save your changes', 'wash'),
			box('trigger', 260, 225, 120, 50, 'Save'),
		],
	},
	progress: {
		caption: 'The indicator fills a portion of the track; the value names it.',
		shapes: [
			box('root', 115, 120, 410, 180, '', 'line'),
			box('label', 135, 138, 260, 32, 'Making progress', 'text'),
			box('valuelabel', 430, 138, 65, 32, '65%', 'text'),
			box('track', 135, 195, 370, 30),
			box('indicator', 139, 199, 235, 22, '', 'wash'),
		],
	},
	otp: {
		caption: 'Individual items display digits; the field receives the input.',
		shapes: [
			box('root', 100, 145, 440, 130, '', 'line'),
			...['2', '4', '8', '', '', ''].map((digit, index) =>
				box('item', 120 + index * 67, 170, 58, 72, digit),
			),
			box('itemindicator', 341, 195, 3, 23, '', 'wash'),
		],
	},
	navbar: {
		caption: 'Navigation links and expandable items live in the same root.',
		shapes: [
			box('root', 80, 135, 480, 75),
			box('item', 95, 148, 125, 48),
			box('itemlink', 102, 155, 110, 33, 'Overview', 'text'),
			box('item', 230, 148, 145, 48, '', 'wash'),
			box('itemtrigger', 237, 155, 130, 33, 'Projects', 'text', 'chevron-down'),
			box('itemcontent', 230, 230, 220, 90, 'Brand / Website / Archive'),
		],
	},
	pagination: {
		caption: 'Previous and next controls frame the page items.',
		shapes: [
			box('root', 80, 165, 480, 90, '', 'line'),
			box('backtrigger', 95, 182, 100, 55, 'Previous'),
			box('item', 210, 182, 58, 55),
			box('itemtrigger', 216, 188, 46, 43, '1', 'text'),
			box('item', 278, 182, 58, 55, '', 'wash'),
			box('itemtrigger', 284, 188, 46, 43, '2', 'text'),
			box('item', 346, 182, 58, 55),
			box('itemlink', 352, 188, 46, 43, '3', 'text'),
			box('forwardtrigger', 425, 182, 115, 55, 'Next'),
		],
	},
	tree: {
		caption: 'An item’s content holds nested items using the same parts.',
		shapes: [
			box('root', 140, 75, 360, 285, '', 'line'),
			box('label', 160, 90, 300, 32, 'Workspace', 'text'),
			box('item', 160, 140, 320, 195),
			box('itemtrigger', 175, 152, 35, 35, '', 'text', 'chevron-down'),
			box('itemlabel', 225, 152, 230, 35, 'Brand', 'text'),
			box('itemcontent', 190, 203, 270, 112, '', 'line'),
			box('item', 205, 218, 240, 38, '', 'wash'),
			box('itemlabel', 240, 222, 190, 30, 'Colors', 'text'),
			box('itemindicator', 212, 227, 20, 20, '✓', 'text'),
			box('item', 205, 267, 240, 35, 'Logos', 'text'),
		],
	},
	checklist: {
		caption: 'A select-all control and individually labelled choices.',
		shapes: [
			box('root', 135, 65, 370, 300, '', 'line'),
			box('label', 155, 80, 270, 32, 'Ready to launch', 'text'),
			box('selectall', 155, 125, 32, 32, '', 'wash'),
			box('selectallindicator', 161, 131, 20, 20, '−', 'text'),
			box('item', 155, 180, 330, 70),
			box('itemtrigger', 170, 195, 30, 30, '', 'wash'),
			box('itemindicator', 175, 200, 20, 20, '✓', 'text'),
			box('itemlabel', 215, 187, 250, 30, 'Check the details', 'text'),
			box('itemdescription', 215, 218, 250, 25, 'Give it one last look.', 'text'),
			box('item', 155, 266, 330, 65, 'Share with the team'),
		],
	},
	gridlist: {
		caption: 'Each card is an item, with its label, selection, and content.',
		shapes: [
			box('root', 105, 85, 430, 260, '', 'line'),
			box('label', 125, 100, 300, 30, 'Recent projects', 'text'),
			box('item', 125, 150, 185, 170),
			box('itemtrigger', 275, 160, 24, 24, '', 'wash'),
			box('itemindicator', 277, 162, 20, 20, '✓', 'text'),
			box('itemlabel', 140, 195, 155, 35, 'Brand studio', 'text'),
			box('itemcontent', 140, 250, 155, 45, '12 files', 'wash'),
			box('item', 330, 150, 185, 170, 'Website'),
		],
	},
	table: {
		caption: 'Column triggers sort; row items contain the cells.',
		shapes: [
			box('root', 110, 100, 420, 225),
			box('coltrigger', 125, 115, 220, 45, 'Project  ↓', 'wash'),
			box('coltrigger', 355, 115, 160, 45, 'Status', 'wash'),
			box('item', 125, 175, 390, 60),
			box('itemcontent', 135, 185, 205, 40, 'Brand studio', 'text'),
			box('itemcontent', 355, 185, 150, 40, 'In progress', 'text'),
			box('item', 125, 245, 390, 60),
			box('itemcontent', 135, 255, 205, 40, 'Website', 'text'),
			box('itemcontent', 355, 255, 150, 40, 'Ready', 'text'),
		],
	},
	resizable: {
		caption: 'A resize handle separates two panels inside the root.',
		shapes: [
			box('root', 100, 100, 440, 220, '', 'line'),
			box('item', 115, 115, 160, 190, 'Sidebar', 'wash'),
			box('thumb', 281, 115, 18, 190, '⋮'),
			box('item', 305, 115, 220, 190, 'Your canvas'),
		],
	},
	carousel: {
		caption: 'The scroll area holds slides; navigation sits outside it.',
		shapes: [
			box('root', 85, 60, 470, 310, '', 'line'),
			box('title', 145, 78, 285, 32, 'A few good moments', 'text'),
			box('scrollarea', 145, 130, 350, 160, '', 'line'),
			box('item', 155, 140, 220, 140, 'The little things', 'wash'),
			box('item', 390, 140, 95, 140, 'Next'),
			box('backtrigger', 100, 190, 35, 40, '', 'surface', 'chevron-left'),
			box('forwardtrigger', 505, 190, 35, 40, '', 'surface', 'chevron-right'),
			box('navlist', 235, 310, 130, 35),
			box('navtrigger', 250, 319, 17, 17, '', 'wash'),
			box('navtrigger', 284, 319, 17, 17, '', 'round'),
			box('navtrigger', 318, 319, 17, 17, '', 'round'),
			box('playtrigger', 405, 310, 80, 35, 'Pause'),
		],
	},
	toaster: {
		caption: 'The root stacks notifications. Each item owns its content and close control.',
		shapes: [
			box('root', 130, 90, 380, 245, '', 'line'),
			box('item', 150, 110, 340, 125),
			box('itemicon', 167, 130, 30, 30, '✓', 'wash'),
			box('itemtitle', 210, 128, 230, 35, 'Changes saved', 'text'),
			box('itemdescription', 210, 177, 250, 35, 'You are good to go.', 'text'),
			box('itemclose', 451, 120, 26, 26, '×', 'text'),
			box('item', 160, 250, 320, 60, 'Your next idea is waiting.', 'wash'),
		],
	},
	qrcode: {
		caption: 'The frame holds a vector pattern and an optional overlay.',
		shapes: [
			box('root', 185, 75, 270, 270, '', 'line'),
			box('frame', 200, 90, 240, 240),
			box('patternsvg', 220, 110, 200, 200, '', 'line'),
			...[
				[225, 115],
				[355, 115],
				[225, 245],
			].flatMap(([x, y]) => [
				box('patternpath', x!, y!, 60, 60, '', 'wash'),
				box('patternpath', x! + 15, y! + 15, 30, 30),
			]),
			...Array.from({ length: 20 }, (_, i) =>
				box(
					'patternpath',
					225 + ((i * 37) % 9) * 20,
					185 + Math.floor(i / 5) * 25,
					12,
					12,
					'',
					'wash',
				),
			),
			box('overlay', 292, 190, 56, 48, 'M'),
		],
	},
};
