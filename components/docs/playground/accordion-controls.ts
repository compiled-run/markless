import type { PlaygroundConfig } from './types.ts';

// Hand-written for the widget's proof. W3 generates this exact shape from
// `@markless/ui/api/manifest.json` (name, type, initial) plus
// `ui-meta/accordion.ts` (order, quick/rest split, select option sets,
// presets). Types and defaults below are the manifest's own values for
// `accordion.root`.
export const accordionPlayground: PlaygroundConfig = {
	family: 'accordion',
	quickCount: 3,
	controls: [
		{
			name: 'multiple',
			kind: 'toggle',
			type: 'boolean',
			initial: 'false',
		},
		{
			name: 'collapsible',
			kind: 'toggle',
			type: 'boolean',
			initial: 'true',
		},
		{
			name: 'disabled',
			kind: 'toggle',
			type: 'boolean',
			initial: 'false',
		},
		{
			name: 'disableUntilFound',
			kind: 'toggle',
			type: 'boolean',
			initial: 'false',
		},
		{
			// `value` is a string prop, so the string mapping (textbox) is what the
			// manifest derives. The demo's item names are a closed set, so
			// ui-meta also offers them as a select — the two edit one cell and
			// neither is redundant: the list names an item, the box takes a name
			// the list does not have.
			name: 'value',
			kind: 'select',
			type: 'string | readonly string[]',
			initial: 'ship',
			options: [
				{ value: 'ship', label: 'ship' },
				{ value: 'returns', label: 'returns' },
				{ value: 'overseas', label: 'overseas' },
				{ value: '', label: '(none)' },
			],
		},
		{
			name: 'value',
			kind: 'textbox',
			type: 'string | readonly string[]',
			initial: 'ship',
			placeholder: 'an item name',
		},
	],
	presets: [
		{
			name: 'basic',
			label: 'Basic',
			values: {
				multiple: 'false',
				collapsible: 'true',
				disabled: 'false',
				disableUntilFound: 'false',
				value: 'ship',
			},
		},
		{
			name: 'multiple',
			label: 'Multiple',
			values: {
				multiple: 'true',
				collapsible: 'true',
				disabled: 'false',
				disableUntilFound: 'false',
				value: 'ship',
			},
		},
		{
			name: 'locked',
			label: 'Locked',
			values: {
				multiple: 'false',
				collapsible: 'true',
				disabled: 'true',
				disableUntilFound: 'false',
				value: 'ship',
			},
		},
		{
			name: 'find',
			label: 'Find in page',
			values: {
				multiple: 'false',
				collapsible: 'true',
				disabled: 'false',
				disableUntilFound: 'true',
				value: '',
			},
		},
	],
};
