import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'tabs',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// `tabsPartState` is deliberately absent: it roots once per trigger, so it can
	// never be one definition per embed.
	widgetDefinitionSuffixes: ['#tabsState'],
	interaction: {
		activate: 'usage-trigger',
		stateAttribute: 'aria-selected',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowRight}',
	// The last trigger in the walk. This list does not loop, so the step from here
	// either goes nowhere or lands in the next embed's first trigger.
	rovingFrom: 'billing-trigger',
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbedPageScope, MultiEmbedPageScope]),
		cellIdIncludes: '#pageReads',
		value: 'page-value',
		bump: 'page-bump',
		afterBump: '1',
	},
	// No disabled entry: tabs has no `disabled` prop, and a consumer's native
	// `disabled` lands on the trigger button itself, which no click can reach.
});
