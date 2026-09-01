import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';
import MultiEmbedPageScope from './scenarios/multi-embed-page-scope.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'buttongroup',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	// `buttongroupItemState` is deliberately absent: it roots once per item, so it
	// can never be one definition per embed.
	widgetDefinitionSuffixes: ['#buttongroupState'],
	interaction: {
		activate: 'center-item',
		stateAttribute: 'aria-pressed',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowRight}',
	// The last item in the walk. This group does not loop, so the step from here
	// either goes nowhere or lands in the next embed's first item.
	rovingFrom: 'right-item',
	pageScoped: {
		render: () => renderSSRIslands([MultiEmbedPageScope, MultiEmbedPageScope]),
		cellIdIncludes: '#pageReads',
		value: 'page-value',
		bump: 'page-bump',
		afterBump: '1',
	},
	// No disabled entry: a locked buttongroup item IS the natively disabled button,
	// and the family renders no element around it, so there is nothing a click can
	// legally land on to witness the no-op. `buttongroup.browser.ts` covers the
	// locked item's own flags.
});
