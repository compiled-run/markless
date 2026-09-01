import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'colorpicker',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#colorpickerState'],
	interaction: {
		activate: 'swatch-pink',
		stateAttribute: 'aria-pressed',
		restValue: 'false',
		activeValue: 'true',
	},
	// No rovingKey: the axis and rail keys step the colour in place, and the
	// swatches are plain tab stops rather than a roving roster.
	// No disabled: `disabled` is a root prop, so one picker is either wholly
	// locked or wholly live and cannot carry a locked control beside a live one.
});
