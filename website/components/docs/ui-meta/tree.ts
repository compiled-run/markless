import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const tree: FamilyMeta = {
	family: 'tree',
	quick: [
		{
			local: 'openSrc',
			label: 'src open',
			doc: 'The open prop on the src row. Change it and the row opens or closes.',
		},
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { openSrc: 'true', disabled: 'false' },
		},
		{
			name: 'closed',
			label: 'All closed',
			values: { openSrc: 'false', disabled: 'false' },
		},
		{
			name: 'locked',
			label: 'Locked',
			values: { openSrc: 'true', disabled: 'true' },
		},
	],
	keyboard: [
		{
			caps: [keys.down, keys.up],
			join: 'or',
			does: 'Move to the next or previous visible row.',
		},
		{ caps: [keys.right], does: 'Open a closed row, or move to its first child.' },
		{ caps: [keys.left], does: 'Close an open row, or move to its parent.' },
	],
	examples: [],
};

export default tree;
