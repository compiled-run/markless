import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'menu',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#menuState'],
	// A nesting item reports what it did on itself: activation opens its submenu
	// rather than choosing, so aria-expanded is the result without closing the
	// surface the other checks need open.
	interaction: {
		activate: 'share-item',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowDown}',
	// The last command in the walk: the wrap from here either stays on this
	// surface or lands on the next embed's first item.
	rovingFrom: 'reload-item',
	// No disabled entry. A locked item spells its refusal as aria-disabled on the
	// very element that reports aria-expanded, and the click actionability wait
	// never lands on an aria-disabled element - so the battery's disabled check,
	// which clicks and reads one element, cannot be written for this family. Owned
	// by packages/headless/components/test-support/multi-embed-conformance.ts.
});
