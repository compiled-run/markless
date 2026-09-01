import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'accordion',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#accordionState'],
	interaction: {
		activate: 'shipping-trigger',
		stateAttribute: 'aria-expanded',
		restValue: 'false',
		activeValue: 'true',
	},
	rovingKey: '{ArrowDown}',
	// The last enabled section in the walk: the wrap from here either stays in this
	// embed or lands in the next one's first trigger.
	rovingFrom: 'returns-trigger',
	// The gesture is aimed at the section, not at the button: a natively disabled
	// button is unclickable, so pointing the check there would only witness
	// Playwright's actionability wait. `ui-open` on the section is what has to stay
	// absent when the click lands on the trigger inside it.
	disabled: { control: 'billing-item', stateAttribute: 'ui-open' },
});
