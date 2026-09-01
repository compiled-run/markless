import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'resizable',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#resizableState'],
	// One written-in size change: the sidebar's declared 30% becomes 45%.
	interaction: {
		activate: 'step',
		observe: 'nav',
		stateAttribute: 'ui-size',
		restValue: '30',
		activeValue: '45',
	},
	// A divider arrow reads the family's plural panel handle to work out which
	// group it belongs to; a merged handle would make that walk leave the embed.
	rovingKey: '{ArrowRight}',
	rovingFrom: 'thumb',
	// No disabled: `disabled` is a root prop, so one group is either wholly
	// locked or wholly live and cannot carry a locked divider beside a live one.
});
