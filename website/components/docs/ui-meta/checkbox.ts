import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const checkbox: FamilyMeta = {
	family: 'checkbox',
	partOrder: ['root', 'trigger', 'indicator', 'label', 'description', 'error', 'field'],
	quick: [
		{ part: 'root', prop: 'disabled' },
		{ part: 'root', prop: 'required' },
	],
	showAll: [],
	presets: [
		{ name: 'basic', label: 'Basic', values: { disabled: 'false', required: 'false' } },
		{ name: 'disabled', label: 'Disabled', values: { disabled: 'true', required: 'false' } },
		{ name: 'required', label: 'Required', values: { disabled: 'false', required: 'true' } },
	],
	keyboard: [
		{ caps: [keys.tab], does: 'Move focus to the box, or past it.' },
		{ caps: [keys.space], does: 'Tick or untick the box.' },
	],
	examples: [],
};

export default checkbox;
