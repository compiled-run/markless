import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'tree',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#treeState'],
	// A closed node carries no aria-expanded at all, so rest is the absent
	// attribute; the trigger is the control and the row is what reports.
	interaction: {
		activate: 'src-itemtrigger',
		observe: 'src-item',
		stateAttribute: 'aria-expanded',
		restValue: null,
		activeValue: 'true',
	},
	rovingKey: '{ArrowDown}',
	rovingFrom: 'readme-item',
	// No disabled entry: this family locks the whole tree, never one node, and a
	// locked tree renders every trigger natively disabled - which would leave the
	// check witnessing the click actionability wait rather than the family.
});
