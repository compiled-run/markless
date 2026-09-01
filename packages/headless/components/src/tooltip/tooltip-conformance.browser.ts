import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'tooltip',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#tooltipState'],
	interaction: {
		activate: 'trigger',
		observe: 'content',
		stateAttribute: 'ui-open',
		restValue: null,
		activeValue: '',
	},
	// No roving key and no disabled entry: this family has no item walk, and it
	// ships no disabled concept at all — the tip is a description of a control
	// the consumer owns.
});
