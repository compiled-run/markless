import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const navbar: FamilyMeta = {
	family: 'navbar',
	partOrder: ['root', 'item', 'itemtrigger', 'itemcontent', 'itemlink'],
	quick: [
		{ part: 'root', prop: 'hover' },
		{ part: 'root', prop: 'value' },
	],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { hover: 'true', value: 'products' } },
		{ name: 'closed', label: 'All closed', values: { hover: 'true', value: '' } },
		{ name: 'click-only', label: 'Click only', values: { hover: 'false', value: '' } },
	],
	keyboard: [
		{ caps: [keys.enter, keys.space], join: 'or', does: 'Open or close the focused dropdown.' },
		{
			caps: [keys.left, keys.right],
			join: 'or',
			does: 'Focus the previous or next top-level control, wrapping at the ends.',
		},
		{
			caps: [keys.home, keys.end],
			join: 'or',
			does: 'Focus the first or last top-level control.',
		},
		{ caps: [keys.down], does: 'On a trigger, open its dropdown and focus the first link.' },
		{
			caps: [keys.escape],
			does: 'Close the dropdown. Focus inside it goes back to the trigger.',
		},
	],
	examples: [],
};

export default navbar;
