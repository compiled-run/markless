import type { FamilyMeta } from './types.ts';

export const radiogroup: FamilyMeta = {
	family: 'radiogroup',
	quick: [
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'orientation' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [
		{ part: 'root', prop: 'loop' },
		{ part: 'root', prop: 'required' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { value: 'annual', orientation: 'vertical', disabled: 'false' },
		},
		{
			name: 'unchosen',
			label: 'None chosen',
			values: { value: '', orientation: 'vertical', disabled: 'false' },
		},
		{
			name: 'row',
			label: 'In a row',
			values: { value: 'annual', orientation: 'horizontal', disabled: 'false' },
		},
		{
			name: 'locked',
			label: 'Locked',
			values: { value: 'annual', orientation: 'vertical', disabled: 'true' },
		},
	],
	keyboard: [],
	examples: [],
};

export default radiogroup;
