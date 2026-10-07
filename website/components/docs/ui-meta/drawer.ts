import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const drawer: FamilyMeta = {
	family: 'drawer',
	partOrder: ['root', 'trigger', 'backdrop', 'content', 'title', 'description', 'close'],
	quick: [
		{ part: 'root', prop: 'orientation' },
		{ part: 'root', prop: 'start' },
	],
	showAll: [
		{ part: 'root', prop: 'modal' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Bottom sheet',
			values: { orientation: 'vertical', start: 'false', modal: 'true' },
		},
		{
			name: 'side',
			label: 'Side panel',
			values: { orientation: 'horizontal', start: 'false', modal: 'true' },
		},
		{
			name: 'top',
			label: 'Top sheet',
			values: { orientation: 'vertical', start: 'true', modal: 'true' },
		},
		{
			name: 'live',
			label: 'Page stays live',
			values: { orientation: 'vertical', start: 'false', modal: 'false' },
		},
	],
	keyboard: [
		{ caps: [keys.escape], does: 'Close the drawer and put focus back on the trigger.' },
		{
			caps: [keys.up, keys.down],
			join: 'or',
			does: 'On a bottom or top sheet, move one rest position more open or more closed.',
		},
		{ caps: [keys.left, keys.right], join: 'or', does: 'The same, on a side panel.' },
	],
	examples: [],
};

export default drawer;
