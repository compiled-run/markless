import type { FamilyMeta } from './types.ts';

export const pagination: FamilyMeta = {
	family: 'pagination',
	quick: [
		{ part: 'root', prop: 'page' },
		{ part: 'root', prop: 'disabled' },
	],
	showAll: [],
	overrides: [{ part: 'root', prop: 'page', options: ['1', '2', '3', '4', '5'] }],
	presets: [
		{ name: 'basic', label: 'Basic', values: { page: '3', disabled: 'false' } },
		{ name: 'first', label: 'First page', values: { page: '1', disabled: 'false' } },
		{ name: 'last', label: 'Last page', values: { page: '5', disabled: 'false' } },
		{ name: 'locked', label: 'Locked', values: { page: '3', disabled: 'true' } },
	],
	keyboard: [],
	examples: [],
};

export default pagination;
