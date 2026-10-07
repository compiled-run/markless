import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const gridlist: FamilyMeta = {
	family: 'gridlist',
	quick: [
		{ part: 'root', prop: 'selectable' },
		{ part: 'root', prop: 'multiple' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [
		{ part: 'root', prop: 'wrap' },
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: {
				selectable: 'true',
				multiple: 'false',
				disabled: 'false',
				wrap: 'false',
				value: 'moodboard',
			},
		},
		{
			name: 'multiple',
			label: 'Pick several',
			values: {
				selectable: 'true',
				multiple: 'true',
				disabled: 'false',
				wrap: 'false',
				value: 'moodboard, invoice',
			},
		},
		{
			name: 'plain',
			label: 'No picking',
			values: {
				selectable: 'false',
				multiple: 'false',
				disabled: 'false',
				wrap: 'false',
				value: '',
			},
		},
		{
			name: 'locked',
			label: 'Locked',
			values: {
				selectable: 'true',
				multiple: 'false',
				disabled: 'true',
				wrap: 'false',
				value: 'moodboard',
			},
		},
	],
	keyboard: [
		{ caps: [keys.down, keys.up], join: 'or', does: 'Focus the row below or above.' },
		{ caps: [keys.enter], does: 'Move focus to the first trigger in the row.' },
		{ caps: [keys.escape], does: 'Move focus from a trigger back to its row.' },
		{ caps: [keys.space], does: 'Pick the focused row, or let it go.' },
	],
	examples: [],
};

export default gridlist;
