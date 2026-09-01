import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'menubar',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#menubarState'],
	interaction: {
		activate: 'file-item',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowRight}',
	// The last item on the bar: a merged roster steps from here into the next
	// embed's first item instead of staying put.
	rovingFrom: 'view-item',
	// No disabled entry. A locked bar item spells its refusal as aria-disabled on
	// the very element that reports aria-expanded, and the click actionability
	// wait never lands on an aria-disabled element - so the battery's disabled
	// check, which clicks and reads one element, cannot be written for this
	// family. Owned by
	// packages/headless/components/test-support/multi-embed-conformance.ts.
});
