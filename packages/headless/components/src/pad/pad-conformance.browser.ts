import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'pad',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#padState'],
	// A press on the field jumps the nearest handle to it, so the click the
	// battery makes is a real value change: the middle of the field is x 0.5.
	interaction: {
		activate: 'area',
		observe: 'thumb',
		stateAttribute: 'aria-valuenow',
		restValue: '0.25',
		activeValue: '0.5',
	},
	// No rovingKey: the arrows step the handle in place and never move focus.
	// No disabled: `disabled` is a root prop, so one pad is either wholly locked
	// or wholly live and cannot carry a locked control beside a live one.
});
