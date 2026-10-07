import { keys } from './keys.ts';
import type { FamilyMeta } from './types.ts';

export const toggle: FamilyMeta = {
	family: 'toggle',
	partOrder: ['root', 'label', 'trigger', 'thumb', 'description', 'error', 'field'],
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
		{ caps: [keys.space, keys.enter], join: 'or', does: 'Flip the focused switch.' },
	],
	examples: [],
};

export default toggle;
