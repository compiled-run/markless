import type { FamilyMeta } from './types.ts';

export const progress: FamilyMeta = {
	family: 'progress',
	quick: [
		{ part: 'root', prop: 'value' },
		{ part: 'root', prop: 'max' },
	],
	showAll: [{ part: 'root', prop: 'min' }],
	overrides: [
		{ part: 'root', prop: 'value', options: ['', '0', '30', '60', '100', '150'] },
		{ part: 'root', prop: 'max', options: ['100', '200'] },
		{ part: 'root', prop: 'min', options: ['0', '20'] },
	],
	presets: [
		{ name: 'basic', label: 'Basic', values: { value: '30', min: '0', max: '100' } },
		{ name: 'unknown', label: 'Unknown amount', values: { value: '', min: '0', max: '100' } },
		{ name: 'done', label: 'Done', values: { value: '100', min: '0', max: '100' } },
		{ name: 'over', label: 'Past the top', values: { value: '150', min: '0', max: '100' } },
		{ name: 'range', label: 'Out of 200', values: { value: '60', min: '0', max: '200' } },
	],
	keyboard: [],
	examples: [],
};

export default progress;
