import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'collapsible',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#collapsibleState'],
	interaction: {
		activate: 'trigger',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbedPageScope, MultiEmbedPageScope]),
		cellIdIncludes: '#pageReads',
		value: 'page-value',
		bump: 'page-bump',
		afterBump: '1',
	},
	// No roving key: a collapsible is one trigger, with no walk of its own.
	// No disabled entry: collapsible's `disabled` locks the whole panel, and a
	// second locked panel in the same embed would give this family two
	// `collapsibleState` definitions per island, which the widget-id check forbids
	// by construction.
});
