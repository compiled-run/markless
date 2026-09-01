import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'slider',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#sliderState'],
	// A press on the rail is the family's own jump-to-point, so the click the
	// battery makes is a real value change: the midpoint of a 200px rail is 50.
	interaction: {
		activate: 'track',
		observe: 'thumb',
		stateAttribute: 'aria-valuenow',
		restValue: '20',
		activeValue: '50',
	},
	// No rovingKey: the arrows step the value in place and never move focus off
	// the thumb, so there is no roster to escape from.
	// No disabled: `disabled` is a root prop, so one slider is either wholly
	// locked or wholly live and cannot carry a locked control beside a live one.
});
