import type { PlaygroundConfig, PlaygroundPreset } from './types.ts';

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
			// A textbox is only for a string prop with no closed option set; the
			// demo's item names are closed, so `value` is a select.
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
			// A function prop is edited as an on/off event log, QDS's convention for
			// showing that a callback fired without printing its argument.
			name: 'onChange',
			kind: 'toggle',
			type: '(value: string | readonly string[]) => void',
			initial: 'false',
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

// The Scenario select hands its handler a preset name; the handler needs the
// preset without searching, so the same list is offered keyed by name.
export const accordionPresetsByName: Readonly<Record<string, PlaygroundPreset>> = Object.fromEntries(
	accordionPlayground.presets.map((preset) => [preset.name, preset]),
);
