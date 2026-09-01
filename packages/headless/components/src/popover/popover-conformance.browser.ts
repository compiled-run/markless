import { renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mount is written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'popover',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#popoverState'],
	interaction: {
		activate: 'trigger',
		observe: 'content',
		stateAttribute: 'ui-open',
		restValue: null,
		activeValue: '',
	},
	// No roving key and no disabled entry: this family has no item walk, and its
	// only disabled surface is a native `disabled` on the trigger, which is one
	// widget per root rather than a locked item inside a shared one.
});
