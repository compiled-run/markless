import type { FamilyMeta } from './types.ts';

export const textbox: FamilyMeta = {
	family: 'textbox',
	quick: [
		{ part: 'root', prop: 'required' },
		{ part: 'root', prop: 'readonly' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { required: 'true', readonly: 'false', disabled: 'false', value: '' },
		},
		{
			name: 'filled',
			label: 'Filled in',
			values: { required: 'true', readonly: 'false', disabled: 'false', value: 'ada99' },
		},
		{
			name: 'readonly',
			label: 'Read only',
			values: { required: 'false', readonly: 'true', disabled: 'false', value: 'ada99' },
		},
		{
			name: 'locked',
			label: 'Locked',
			values: { required: 'false', readonly: 'false', disabled: 'true', value: '' },
		},
	],
	keyboard: [],
	examples: [],
};

export default textbox;
