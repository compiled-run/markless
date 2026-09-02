import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'taglist',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#taglistState'],
	interaction: {
		activate: 'itemclose',
		observe: 'root',
		stateAttribute: 'ui-empty',
		restValue: null,
		activeValue: '',
	},
	rovingKey: '{ArrowRight}',
	rovingFrom: 'itemclose',
	// No disabled entry: `disabled` locks the whole row — there is no per-tag lock —
	// and a second locked root in the same embed would give this family two
	// `taglistState` definitions per island, which the widget-id check forbids.
});
