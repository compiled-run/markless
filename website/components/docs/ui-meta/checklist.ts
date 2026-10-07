import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const checklist: FamilyMeta = {
	family: 'checklist',
	partOrder: [
		'root',
		'label',
		'selectall',
		'selectallindicator',
		'item',
		'itemtrigger',
		'itemindicator',
		'itemlabel',
		'itemdescription',
		'error',
		'field',
	],
	quick: [{ part: 'root', prop: 'disabled' }],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { disabled: 'false' } },
		{ name: 'locked', label: 'Locked', values: { disabled: 'true' } },
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Move to the next box. Every box is its own Tab stop.' },
		{ caps: [keys.space], does: 'Tick or clear the focused box.' },
	],
	examples: [],
};

export default checklist;
