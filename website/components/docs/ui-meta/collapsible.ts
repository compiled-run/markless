import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const collapsible: FamilyMeta = {
	family: 'collapsible',
	partOrder: ['root', 'trigger', 'content'],
	quick: [
		{ part: 'root', prop: 'disabled' },
		{ part: 'root', prop: 'disableUntilFound' },
	],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { disabled: 'false', disableUntilFound: 'false' },
		},
		{
			name: 'locked',
			label: 'Locked',
			values: { disabled: 'true', disableUntilFound: 'false' },
		},
		{
			name: 'no-find',
			label: 'Hidden from find',
			values: { disabled: 'false', disableUntilFound: 'true' },
		},
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Focus the trigger.' },
		{ caps: [keys.enter, keys.space], join: 'or', does: 'Open or close the panel.' },
	],
	examples: [],
};

export default collapsible;
