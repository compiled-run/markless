import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'otp',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#otpState'],
	interaction: {
		activate: 'field',
		keys: '12',
		observe: 'item-0',
		stateAttribute: 'ui-empty',
		restValue: '',
		activeValue: null,
	},
	// No roving key: one field covers every box, so a keystroke never moves focus.
	// No disabled entry: `disabled` locks the whole field, and a second locked root
	// in the same embed would give this family two `otpState` definitions per
	// island, which the widget-id check forbids by construction.
});
