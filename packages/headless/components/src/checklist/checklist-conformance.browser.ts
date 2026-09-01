import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'checklist',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// `#checkboxState` is deliberately absent: the list roots one box for the
	// select-all and one per item, so it can never be one definition per embed.
	widgetDefinitionSuffixes: ['#checklistState'],
	interaction: {
		activate: 'lettuce-trigger',
		stateAttribute: 'aria-checked',
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
	// No roving key: a checklist has no walk of its own; each item is its own tab stop.
	// The gesture is aimed at the item, not at its trigger: a natively disabled
	// button is unclickable, so pointing the check there would only witness an
	// actionability wait. `ui-checked` on the item is what has to stay absent when
	// the click lands on the trigger inside it.
	disabled: { control: 'pickles-item', stateAttribute: 'ui-checked' },
});
