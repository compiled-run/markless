import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const resizable: FamilyMeta = {
	family: 'resizable',
	quick: [
		{ part: 'root', prop: 'orientation' },
		{ part: 'root', prop: 'step' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [],
	overrides: [{ part: 'root', prop: 'step', options: ['1', '5', '10'] }],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { orientation: 'horizontal', step: '1', disabled: 'false' },
		},
		{
			name: 'stacked',
			label: 'Stacked',
			values: { orientation: 'vertical', step: '1', disabled: 'false' },
		},
		{
			name: 'coarse',
			label: 'Big steps',
			values: { orientation: 'horizontal', step: '10', disabled: 'false' },
		},
		{
			name: 'locked',
			label: 'Locked',
			values: { orientation: 'horizontal', step: '1', disabled: 'true' },
		},
	],
	keyboard: [
		{ caps: [keys.left, keys.right], join: 'or', does: 'Move the divider one step.' },
		{ caps: [keys.home], does: "Shrink the panel to the divider's min." },
		{ caps: [keys.end], does: "Grow the panel to the divider's max." },
	],
	examples: [],
};

export default resizable;
