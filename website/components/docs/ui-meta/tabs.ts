import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const tabs: FamilyMeta = {
	family: 'tabs',
	quick: [
		{ part: 'root', prop: 'selectOnFocus' },
		{ part: 'root', prop: 'loop' },
		{ part: 'root', prop: 'orientation' },
	],
	showAll: [
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'onChange' },
	],
	overrides: [{ part: 'root', prop: 'selectOnFocus', label: 'Select on focus' }],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: {
				selectOnFocus: 'true',
				loop: 'false',
				orientation: 'horizontal',
				value: 'overview',
			},
		},
		{
			name: 'manual',
			label: 'Show on Enter',
			values: {
				selectOnFocus: 'false',
				loop: 'false',
				orientation: 'horizontal',
				value: 'overview',
			},
		},
		{
			name: 'loop',
			label: 'Wrap round',
			values: {
				selectOnFocus: 'true',
				loop: 'true',
				orientation: 'horizontal',
				value: 'overview',
			},
		},
		{
			name: 'vertical',
			label: 'Down the side',
			values: {
				selectOnFocus: 'true',
				loop: 'false',
				orientation: 'vertical',
				value: 'overview',
			},
		},
	],
	keyboard: [
		{ caps: [keys.left, keys.right], join: 'or', does: 'Move to the previous or next tab.' },
		{ caps: [keys.home, keys.end], join: 'or', does: 'Move to the first or last tab.' },
		{
			caps: [keys.enter, keys.space],
			join: 'or',
			does: 'Show the focused tab, when selectOnFocus is false.',
		},
	],
	examples: [],
};

export default tabs;
