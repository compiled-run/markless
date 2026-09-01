import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const accordion: FamilyMeta = {
	family: 'accordion',
	partOrder: ['root', 'item', 'itemlabel', 'itemtrigger', 'itemcontent'],
	quick: [
		{ part: 'root', prop: 'multiple' },
		{ part: 'root', prop: 'collapsible' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [
		{ part: 'root', prop: 'disableUntilFound' },
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'onChange' },
	],
	keyboard: [
		{ caps: [keys.down], does: 'Focus the next trigger, wrapping round to the first.' },
		{ caps: [keys.up], does: 'Focus the previous trigger, wrapping round to the last.' },
		{ caps: [keys.home], does: 'Focus the first trigger.' },
		{ caps: [keys.end], does: 'Focus the last trigger.' },
		{ caps: [keys.enter, keys.space], join: 'or', does: 'Open or close the focused section.' },
	],
	examples: [
		{ id: 'faq', title: 'Help centre questions' },
		{ id: 'settings', title: 'Settings sections' },
	],
};

export default accordion;
