import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const combobox: FamilyMeta = {
	family: 'combobox',
	partOrder: [
		'root',
		'label',
		'input',
		'trigger',
		'content',
		'item',
		'itemlabel',
		'itemindicator',
		'description',
		'error',
		'field',
	],
	quick: [
		{ part: 'root', prop: 'multiple' },
		{ part: 'root', prop: 'inline' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [
		{ part: 'root', prop: 'loop' },
		{ part: 'root', prop: 'invalid' },
		{ part: 'root', prop: 'onChange' },
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: { multiple: 'false', inline: 'true', disabled: 'false' },
		},
		{
			name: 'popup',
			label: 'Popup list',
			values: { multiple: 'false', inline: 'false', disabled: 'false' },
		},
		{
			name: 'multiple',
			label: 'Multiple',
			values: { multiple: 'true', inline: 'true', disabled: 'false' },
		},
	],
	keyboard: [
		{
			caps: [keys.down],
			does: 'Open the list on the first option, or move the highlight down.',
		},
		{ caps: [keys.up], does: 'Open the list on the last option, or move the highlight up.' },
		{ caps: [keys.enter], does: 'While the list shows, pick the highlighted option.' },
		{ caps: [keys.escape], does: 'Close the list. The choice stays as it was.' },
		{ caps: [keys.tab], does: 'Close the list and move on.' },
	],
	examples: [],
};

export default combobox;
