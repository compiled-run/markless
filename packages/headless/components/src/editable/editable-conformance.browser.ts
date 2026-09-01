import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'editable',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#editableState'],
	interaction: {
		activate: 'trigger',
		observe: 'root',
		stateAttribute: 'ui-editing',
		restValue: null,
		activeValue: '',
	},
	// No roving key: an editable is one control, with no walk of its own.
	// No disabled entry: `disabled` locks the whole control, and a second locked
	// root in the same embed would give this family two `editableState` definitions
	// per island, which the widget-id check forbids by construction.
});
