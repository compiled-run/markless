import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'datebox',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#dateboxState'],
	interaction: {
		activate: 'day',
		keys: '{ArrowUp}',
		observe: 'root',
		stateAttribute: 'ui-empty',
		restValue: '',
		activeValue: null,
	},
	rovingKey: '{ArrowRight}',
	// The last box in the walk: the step from here either stops inside this embed
	// or lands on the next one's month.
	rovingFrom: 'year',
	// No disabled entry: `disabled` locks every segment at once, and a second locked
	// root in the same embed would give this family two `dateboxState` definitions
	// per island, which the widget-id check forbids by construction.
});
