import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'rating',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#ratingState'],
	interaction: {
		activate: 'star-4',
		stateAttribute: 'aria-checked',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowRight}',
	rovingFrom: 'star-5',
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbedPageScope, MultiEmbedPageScope]),
		cellIdIncludes: '#pageReads',
		value: 'page-value',
		bump: 'page-bump',
		afterBump: '1',
	},
	// No disabled entry: rating's `disabled` locks the whole group, and a second
	// locked group in the same embed would give this family two `ratingState`
	// definitions per island, which the widget-id check forbids by construction.
});
