import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const select: FamilyMeta = {
	family: 'select',
	partOrder: ['root', 'label', 'trigger', 'content', 'item', 'itemlabel', 'itemindicator', 'field'],
	quick: [
		{ part: 'root', prop: 'disabled' },
		{ part: 'root', prop: 'required' },
	],
	showAll: [{ part: 'root', prop: 'onChange' }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { disabled: 'false', required: 'false' } },
		{ name: 'disabled', label: 'Disabled', values: { disabled: 'true', required: 'false' } },
		{ name: 'required', label: 'Required', values: { disabled: 'false', required: 'true' } },
	],
	keyboard: [
		{ caps: [keys.enter, keys.space], join: 'or', does: 'Open the list, or pick the focused option.' },
		{ caps: [keys.down, keys.up], join: 'or', does: 'Move to the next or previous option.' },
		{ caps: [keys.escape], does: 'Close the list without a change.' },
	],
	examples: [],
};

export default select;
