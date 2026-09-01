import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'radio-group',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// `radiogroupItemState` is deliberately absent: it roots once per option, so it
	// can never be one definition per embed.
	widgetDefinitionSuffixes: ['#radiogroupState'],
	interaction: {
		activate: 'standard-trigger',
		// A chosen option is marked with a bare `ui-selected`, so at rest the
		// attribute is absent rather than "false".
		stateAttribute: 'ui-selected',
		restValue: null,
		activeValue: '',
	},
	// The group is vertical by default and it loops, so ArrowDown from the last
	// option wraps inside this embed unless the roster merged.
	rovingKey: '{ArrowDown}',
	rovingFrom: 'overnight-field',
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbedPageScope, MultiEmbedPageScope]),
		cellIdIncludes: '#pageReads',
		value: 'page-value',
		bump: 'page-bump',
		afterBump: '1',
	},
	// The gesture is aimed at the option's trigger, a div: the option's own input is
	// natively disabled, so pointing the check there would only witness an
	// actionability wait.
	disabled: { control: 'courier-trigger' },
});
