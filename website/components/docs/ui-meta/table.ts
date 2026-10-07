import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const table: FamilyMeta = {
	family: 'table',
	quick: [
		{ part: 'root', prop: 'multiple' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { multiple: 'false', disabled: 'false' } },
		{
			name: 'multiple',
			label: 'Pick several',
			values: { multiple: 'true', disabled: 'false' },
		},
		{ name: 'locked', label: 'Locked', values: { multiple: 'false', disabled: 'true' } },
	],
	keyboard: [
		{ caps: [keys.left, keys.right], join: 'or', does: 'Move to the cell before or after.' },
		{
			caps: [keys.down, keys.up],
			join: 'or',
			does: 'Move to the same column in the next or previous row.',
		},
		{ caps: [keys.space], does: 'Pick the row, or let it go.' },
	],
	examples: [],
};

export default table;
