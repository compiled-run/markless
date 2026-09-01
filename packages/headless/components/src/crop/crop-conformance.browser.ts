import { renderCsrIslands, renderSSRIslands } from '@markless/vitest-browser';
import { runMultiEmbedConformance } from '../../test-support/multi-embed-conformance.ts';
import MultiEmbed from './scenarios/multi-embed.tsrx';

// The island mounts are written out here rather than inside the shared battery:
// the SSR island lever is a string-level transform that resolves each component
// identifier against THIS file's own import statements.
runMultiEmbedConformance({
	family: 'crop',
	render: () => renderSSRIslands([MultiEmbed, MultiEmbed]),
	renderCsr: () => renderCsrIslands([MultiEmbed, MultiEmbed]),
	embedFrame: 'frame',
	widgetDefinitionSuffixes: ['#cropState'],
	// One arrow step of the rectangle: the inline-end edge sits at x + width, so
	// 40 + 200 becomes 41 + 200.
	interaction: {
		activate: 'step',
		observe: 'handle-inline-end',
		stateAttribute: 'aria-valuenow',
		restValue: '240',
		activeValue: '241',
	},
	// No rovingKey: the arrows move the rectangle or an edge in place and never
	// move focus off the part they were pressed on.
	// No disabled: `disabled` is a root prop, so one crop is either wholly locked
	// or wholly live and cannot carry a locked control beside a live one.
});
