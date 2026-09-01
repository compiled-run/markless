import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'navbar',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#navbarState'],
	interaction: {
		activate: 'products-itemtrigger',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowRight}',
	// The bar walk wraps at both ends, so the last control is where a merged
	// roster wraps into the next embed instead of back to this one's first.
	rovingFrom: 'pricing-itemlink',
	// No disabled entry: this family has no disabled prop on the root or on an
	// item. An item nobody may use is one the consumer does not render.
});
