import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'pagination',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#paginationState'],
	// The page nobody is on carries no aria-current at all, so rest is the absent
	// attribute and the same button reports the move it caused.
	interaction: {
		activate: 'itemtrigger-2',
		stateAttribute: 'aria-current',
		restValue: null,
		activeValue: 'page',
	},
	// No rovingKey: this family binds no element roster and answers no movement
	// key. Its controls are ordinary tab stops, so there is no walk to contain.
	//
	// No disabled entry: `disabled` here locks the whole widget, which cannot
	// coexist with the interaction check in one embed, and the ends of the range
	// are natively disabled buttons a click can never reach.
});
