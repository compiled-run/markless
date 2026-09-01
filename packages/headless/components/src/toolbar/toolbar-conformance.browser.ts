import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'toolbar',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#toolbarState'],
	// The bar's own tab stop is what a merged instance cell would move: cold the
	// bar carries the page's single stop, and the first focus inside it hands the
	// stop to a control and drops the bar out of the tab order.
	interaction: {
		activate: 'italic-item',
		observe: 'root',
		stateAttribute: 'tabindex',
		restValue: '0',
		activeValue: '-1',
	},
	rovingKey: '{ArrowRight}',
	rovingFrom: 'underline-item',
	// No disabled entry: a locked toolbar item stays focusable and walkable by the
	// APG rule, and its refusal is the consumer callback never firing - nothing on
	// the control itself moves, so there is no attribute for this check to read.
});
