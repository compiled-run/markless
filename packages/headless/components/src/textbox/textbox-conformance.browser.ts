import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'textbox',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#textboxState'],
	interaction: {
		activate: 'input',
		keys: 'ada',
		observe: 'root',
		stateAttribute: 'ui-empty',
		restValue: '',
		activeValue: null,
	},
	// No roving key: a textbox is one control, with no walk of its own.
	// No disabled entry: `disabled` locks the whole control, and a second locked
	// root in the same embed would give this family two `textboxState` definitions
	// per island, which the widget-id check forbids by construction.
});
